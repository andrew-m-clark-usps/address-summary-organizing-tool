"""
train.py — Train an XGBoost confidence scorer for address verification results.

The model predicts a calibrated confidence score (0–100) given a feature
vector derived from the verification result fields.

Features (18 total):
  0  has_street           — street field is non-empty
  1  has_city             — city field is non-empty
  2  has_state            — state field is non-empty
  3  has_zip              — ZIP field is non-empty
  4  has_zip4             — ZIP+4 available
  5  street_num_present   — street starts with a number
  6  zip_valid_5digit     — ZIP is exactly 5 digits
  7  dpv_Y                — DPV match code = Y (exact match)
  8  dpv_S                — DPV match code = S (secondary unconfirmed)
  9  dpv_D                — DPV match code = D (missing secondary)
  10 dpv_N                — DPV match code = N (no match)
  11 from_cache           — result was served from Redis cache
  12 source_usps          — source = USPS API
  13 source_sagemaker     — source = SageMaker NER
  14 source_bedrock       — source = Bedrock Claude
  15 source_offline       — source = offline/local rules
  16 has_carrier_route    — carrier route assigned
  17 has_delivery_point   — delivery point barcode available

Target: confidence score 0.0–1.0 (from USPS DPV + heuristics)

Data source: Databricks addresses.verified.results table.
Falls back to synthetic data if Databricks is unavailable.

Usage:
  python train.py \
    --output-dir     s3://bucket/models/address-scorer/ \
    --data-path      /path/to/verified.csv

SageMaker Training Job:
  estimator = SKLearn(
      entry_point    = "train.py",
      source_dir     = "infrastructure/ml/scorer/",
      role           = sagemaker_role_arn,
      framework_version = "1.2-1",
      instance_type  = "ml.m5.large",
      hyperparameters = {
          "output-dir": "/opt/ml/model",
          "n-estimators": 300,
          "max-depth": 6,
      }
  )
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import joblib

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

FEATURE_NAMES = [
    "has_street", "has_city", "has_state", "has_zip", "has_zip4",
    "street_num_present", "zip_valid_5digit",
    "dpv_Y", "dpv_S", "dpv_D", "dpv_N",
    "from_cache",
    "source_usps", "source_sagemaker", "source_bedrock", "source_offline",
    "has_carrier_route", "has_delivery_point",
]

# ──────────────────────────────────────────────────────────────
# Feature extraction
# ──────────────────────────────────────────────────────────────

def extract_features(df: pd.DataFrame) -> np.ndarray:
    """Convert a DataFrame of verification results to a feature matrix."""
    import re

    def has_col(col):
        return df[col].notna() & (df[col].astype(str).str.strip() != "") if col in df.columns else pd.Series(False, index=df.index)

    street = has_col("std_street")
    city   = has_col("std_city")
    state  = has_col("std_state")
    zip_   = has_col("std_zip")
    zip4   = has_col("std_zip4")

    def starts_num(s):
        return bool(re.match(r"^\d", str(s))) if pd.notna(s) and str(s).strip() else False

    def valid_zip5(s):
        return bool(re.fullmatch(r"\d{5}", str(s).strip())) if pd.notna(s) else False

    street_num  = df["std_street"].apply(starts_num) if "std_street" in df.columns else pd.Series(False, index=df.index)
    zip_valid   = df["std_zip"].apply(valid_zip5) if "std_zip" in df.columns else pd.Series(False, index=df.index)

    dpv = df.get("dpv_match_code", pd.Series("N", index=df.index)).fillna("N")
    source = df.get("source", pd.Series("offline", index=df.index)).fillna("offline")

    carrier = has_col("carrier_route")
    dp      = has_col("delivery_point")
    cache   = df.get("from_cache", pd.Series(False, index=df.index)).fillna(False).astype(bool)

    X = np.column_stack([
        street.astype(float),
        city.astype(float),
        state.astype(float),
        zip_.astype(float),
        zip4.astype(float),
        street_num.astype(float),
        zip_valid.astype(float),
        (dpv == "Y").astype(float),
        (dpv == "S").astype(float),
        (dpv == "D").astype(float),
        (dpv == "N").astype(float),
        cache.astype(float),
        (source == "usps").astype(float),
        source.str.startswith("sagemaker").astype(float),
        source.str.startswith("bedrock").astype(float),
        source.str.startswith("offline").astype(float),
        carrier.astype(float),
        dp.astype(float),
    ])
    return X


def extract_target(df: pd.DataFrame) -> np.ndarray:
    """
    Derive a continuous confidence label in [0, 1].
    Uses the 'confidence' column if present; otherwise derives from DPV.
    """
    if "confidence" in df.columns:
        y = pd.to_numeric(df["confidence"], errors="coerce").fillna(0)
        # Normalise to 0–1 if stored as 0–100
        if y.max() > 1.5:
            y = y / 100.0
        return y.clip(0, 1).to_numpy()

    dpv = df.get("dpv_match_code", pd.Series("N", index=df.index)).fillna("N")
    return dpv.map({"Y": 0.97, "S": 0.82, "D": 0.72, "N": 0.25}).fillna(0.25).to_numpy()


# ──────────────────────────────────────────────────────────────
# Data loading
# ──────────────────────────────────────────────────────────────

def load_from_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]
    return df


def load_from_databricks(host, token, warehouse_id, catalog, limit) -> pd.DataFrame:
    try:
        from databricks import sql as dbsql
        conn = dbsql.connect(
            server_hostname=host,
            http_path=f"/sql/1.0/warehouses/{warehouse_id}",
            access_token=token,
        )
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT std_street, std_city, std_state, std_zip, std_zip4,
                   dpv_match_code, from_cache, source, carrier_route,
                   delivery_point, confidence
            FROM   {catalog}.verified.results
            WHERE  status IS NOT NULL
            LIMIT  {limit}
        """)
        rows    = cursor.fetchall()
        columns = [d[0] for d in cursor.description]
        cursor.close(); conn.close()
        return pd.DataFrame(rows, columns=columns)
    except Exception as exc:
        log.warning("Databricks load failed (%s).", exc)
        return pd.DataFrame()


def generate_synthetic(n: int = 3000) -> pd.DataFrame:
    """Generate synthetic feature data for bootstrapping."""
    import random
    rng = random.Random(42)
    records = []
    dpvs    = ["Y"] * 60 + ["S"] * 15 + ["D"] * 10 + ["N"] * 15
    sources = ["usps"] * 60 + ["sagemaker-ner"] * 15 + ["bedrock"] * 10 + ["offline"] * 15

    for _ in range(n):
        dpv    = rng.choice(dpvs)
        source = rng.choice(sources)
        records.append({
            "std_street":     f"{rng.randint(1,9999)} MAIN ST",
            "std_city":       "SPRINGFIELD",
            "std_state":      "IL",
            "std_zip":        str(rng.randint(10000, 99999)),
            "std_zip4":       str(rng.randint(1000, 9999)) if dpv == "Y" else "",
            "dpv_match_code": dpv,
            "from_cache":     rng.choice([True, False]),
            "source":         source,
            "carrier_route":  "C001" if dpv in {"Y","S"} else "",
            "delivery_point": str(rng.randint(10, 99)) if dpv == "Y" else "",
            "confidence":     {"Y": rng.uniform(90, 99), "S": rng.uniform(75, 90),
                               "D": rng.uniform(65, 80), "N": rng.uniform(10, 50)}[dpv],
        })
    return pd.DataFrame(records)


# ──────────────────────────────────────────────────────────────
# Training
# ──────────────────────────────────────────────────────────────

def train(args: argparse.Namespace) -> None:
    log.info("Training XGBoost confidence scorer …")

    # Load data
    df = pd.DataFrame()
    if args.databricks_host:
        df = load_from_databricks(args.databricks_host, args.databricks_token,
                                   args.databricks_warehouse_id, args.databricks_catalog,
                                   args.max_samples)
    if df.empty and args.data_path and Path(args.data_path).exists():
        df = load_from_csv(args.data_path)
    if df.empty:
        log.warning("No real data — using synthetic data.")
        df = generate_synthetic(args.synthetic_samples)

    log.info("Loaded %d records.", len(df))

    X = extract_features(df)
    y = extract_target(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )
    log.info("Train: %d  Test: %d", len(X_train), len(X_test))

    # XGBoost regressor
    xgb_model = xgb.XGBRegressor(
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="reg:squarederror",
        eval_metric="mae",
        n_jobs=-1,
        random_state=42,
        early_stopping_rounds=20,
    )

    xgb_model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_pred = xgb_model.predict(X_test).clip(0, 1)
    mae    = mean_absolute_error(y_test, y_pred)
    r2     = r2_score(y_test, y_pred)
    log.info("Test MAE: %.4f   R²: %.4f", mae, r2)

    # Save model + metadata
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    model_path = output_dir / "model.joblib"
    joblib.dump(xgb_model, model_path)
    log.info("Model saved: %s", model_path)

    meta = {
        "feature_names": FEATURE_NAMES,
        "n_features":    len(FEATURE_NAMES),
        "mae":           mae,
        "r2":            r2,
        "n_train":       len(X_train),
        "framework":     "xgboost",
    }
    (output_dir / "metadata.json").write_text(json.dumps(meta, indent=2))
    log.info("Metadata saved.")


# ──────────────────────────────────────────────────────────────
# SageMaker inference entry points (used by Scikit-learn container)
# ──────────────────────────────────────────────────────────────

def model_fn(model_dir: str):
    model_path = Path(model_dir) / "model.joblib"
    return joblib.load(model_path)


def input_fn(request_body: str, content_type: str = "application/json"):
    """Accept a JSON array of feature vectors: {"instances": [[f0,f1,...], ...]}"""
    data = json.loads(request_body)
    return np.array(data.get("instances", data), dtype=float)


def predict_fn(X: np.ndarray, model) -> np.ndarray:
    scores = model.predict(X).clip(0, 1)
    return (scores * 100).round(1)   # Return as 0–100


def output_fn(predictions: np.ndarray, accept: str = "application/json"):
    return json.dumps({"predictions": predictions.tolist()}), "application/json"


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Train XGBoost address confidence scorer")
    p.add_argument("--output-dir",       default="/opt/ml/model")
    p.add_argument("--data-path",        default="")
    p.add_argument("--n-estimators",     type=int, default=300)
    p.add_argument("--max-depth",        type=int, default=6)
    p.add_argument("--max-samples",      type=int, default=100000)
    p.add_argument("--synthetic-samples",type=int, default=5000)
    p.add_argument("--databricks-host",         default=os.getenv("DATABRICKS_HOST", ""))
    p.add_argument("--databricks-token",        default=os.getenv("DATABRICKS_TOKEN", ""))
    p.add_argument("--databricks-warehouse-id", default=os.getenv("DATABRICKS_WAREHOUSE_ID", ""))
    p.add_argument("--databricks-catalog",      default=os.getenv("DATABRICKS_CATALOG", "addresses"))
    return p.parse_args()


if __name__ == "__main__":
    train(parse_args())
