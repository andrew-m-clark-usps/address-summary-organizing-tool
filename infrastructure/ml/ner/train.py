"""
train.py — Fine-tune dslim/bert-base-NER for USPS address component extraction.

Model: bert-base-NER (CoNLL-2003 pre-trained) → fine-tuned on USPS address corpus.

Custom label schema (BIO format):
  B/I-NUM     Street number       "123"
  B/I-PREDIR  Pre-directional     "N", "NE"
  B/I-STR     Street name         "MAIN", "OAK GROVE"
  B/I-SUF     Street suffix       "ST", "AVE", "BLVD"
  B/I-POSTDIR Post-directional    "NW"
  B/I-SEC     Secondary unit      "APT", "STE", "UNIT"
  B/I-SECNUM  Secondary number    "4B", "200"
  B/I-CITY    City name           "SPRINGFIELD"
  B-STATE     State abbreviation  "IL"
  B-ZIP5      ZIP code            "62701"
  B-ZIP4      ZIP+4 extension     "1234"
  O           Outside / padding

Data sources (in order of priority):
  1. Databricks: addresses.ml.training_data  (human-labeled)
  2. CSV file:   --data-path argument
  3. Synthetic:  auto-generated from USPS abbreviation rules (fallback)

Usage:
  python train.py \
    --output-dir s3://your-bucket/models/address-ner/ \
    --data-path  /path/to/addresses.csv \
    --epochs     5 \
    --batch-size 16

SageMaker Training Job:
  estimator = HuggingFace(
      entry_point    = "train.py",
      source_dir     = "infrastructure/ml/ner/",
      role           = sagemaker_role_arn,
      transformers_version = "4.36",
      pytorch_version      = "2.1",
      py_version           = "py310",
      instance_type        = "ml.p3.2xlarge",
      instance_count       = 1,
      hyperparameters = {
          "output-dir":  "/opt/ml/model",
          "epochs":      5,
          "batch-size":  16,
          "model-name":  "dslim/bert-base-NER"
      }
  )
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import torch
from datasets import Dataset, DatasetDict, ClassLabel, Sequence
from evaluate import load as load_metric
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Label schema
# ──────────────────────────────────────────────────────────────

LABEL_NAMES = [
    "O",
    "B-NUM",    "I-NUM",
    "B-PREDIR", "I-PREDIR",
    "B-STR",    "I-STR",
    "B-SUF",    "I-SUF",
    "B-POSTDIR","I-POSTDIR",
    "B-SEC",    "I-SEC",
    "B-SECNUM", "I-SECNUM",
    "B-CITY",   "I-CITY",
    "B-STATE",
    "B-ZIP5",
    "B-ZIP4",
]

LABEL2ID = {lbl: i for i, lbl in enumerate(LABEL_NAMES)}
ID2LABEL = {i: lbl for lbl, i in LABEL2ID.items()}

# ──────────────────────────────────────────────────────────────
# Rule-based BIO auto-tagger
# Used to generate synthetic training data when labeled data
# is unavailable.  Human-labeled data always takes precedence.
# ──────────────────────────────────────────────────────────────

_STREET_SUFFIXES = {
    "ST", "AVE", "RD", "DR", "BLVD", "LN", "CT", "CIR", "PL", "TER",
    "WAY", "TRL", "HWY", "PKWY", "EXPY", "PIKE", "SQ", "RDG", "CRK",
    "BRK", "BR", "HBR", "HTS", "HLS", "HOLW", "IS", "KNLS", "LK",
    "LNDG", "MNR", "MDWS", "MLS", "MSN", "MT", "MTN", "ORCH", "PASS",
    "PATH", "PLN", "PLNS", "PT", "PRT", "PR", "RNCH", "RPDS", "RST",
    "RIV", "RUN", "SHL", "SHR", "SKWY", "SPG", "SPGS", "SPUR", "STA",
    "STRM", "SMT", "TPKE", "UN", "VLY", "VIA", "VLG", "VIS", "WALK",
    "WL", "WLS", "WHRF", "WDS",
}

_PREDIRS = {"N", "S", "E", "W", "NE", "NW", "SE", "SW",
            "NORTH", "SOUTH", "EAST", "WEST",
            "NORTHEAST", "NORTHWEST", "SOUTHEAST", "SOUTHWEST"}

_SEC_UNITS = {"APT", "APARTMENT", "STE", "SUITE", "UNIT", "BLDG", "BUILDING",
              "FL", "FLOOR", "RM", "ROOM", "DEPT", "DEPARTMENT",
              "LOT", "TRLR", "TRAILER", "SLIP", "PIER", "STOP", "OFC"}

_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
    "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
    "DC","PR","GU","VI","AS","MP","AA","AE","AP",
}


def _tokenize_address(text: str) -> list[str]:
    """Split address string into tokens, preserving ZIP+4 hyphen."""
    return re.findall(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*|[^\w\s]", text)


def auto_tag(address: dict) -> list[tuple[str, str]]:
    """
    Produce a list of (token, BIO-label) pairs for a structured address dict.
    Fields: street, city, state, zip.
    """
    pairs: list[tuple[str, str]] = []

    street_raw = (address.get("street") or "").strip().upper()
    city_raw   = (address.get("city")   or "").strip().upper()
    state_raw  = (address.get("state")  or "").strip().upper()
    zip_raw    = re.sub(r"\s", "", (address.get("zip") or "").strip())

    # ── Street ──────────────────────────────────────────────
    tokens = _tokenize_address(street_raw)
    i = 0
    in_street_name = False
    street_name_started = False
    while i < len(tokens):
        tok = tokens[i]

        # Skip punctuation
        if not re.match(r"[A-Z0-9]", tok):
            i += 1
            continue

        # Street number at the start
        if not pairs and re.match(r"^\d+$", tok):
            pairs.append((tok, "B-NUM"))
            # Handle fractional (e.g. "123 1/2")
            if i + 2 < len(tokens) and tokens[i + 1] == "/" and re.match(r"^\d+$", tokens[i + 2]):
                pairs.append((tokens[i + 1], "I-NUM"))
                pairs.append((tokens[i + 2], "I-NUM"))
                i += 3
                continue
            i += 1
            continue

        # PO Box
        if tok in {"PO", "P.O."} and i + 1 < len(tokens) and tokens[i + 1] in {"BOX", "BOX"}:
            pairs.append((tok, "B-SEC"))
            pairs.append((tokens[i + 1], "I-SEC"))
            i += 2
            if i < len(tokens):
                pairs.append((tokens[i], "B-SECNUM"))
                i += 1
            continue

        # Pre-directional (only before street name)
        if not street_name_started and tok in _PREDIRS:
            pairs.append((tok, "B-PREDIR"))
            i += 1
            continue

        # Secondary unit designator
        if tok in _SEC_UNITS:
            # Everything before this becomes street-name tokens if not yet labeled
            pairs.append((tok, "B-SEC"))
            in_street_name = False
            i += 1
            if i < len(tokens) and re.match(r"[A-Z0-9#]", tokens[i]):
                pairs.append((tokens[i], "B-SECNUM"))
                i += 1
                while i < len(tokens) and re.match(r"[A-Z0-9-]", tokens[i]):
                    pairs.append((tokens[i], "I-SECNUM"))
                    i += 1
            continue

        # Street suffix
        if tok in _STREET_SUFFIXES and not in_street_name is False:
            pairs.append((tok, "B-SUF"))
            in_street_name = False
            i += 1
            # Post-directional immediately after suffix?
            if i < len(tokens) and tokens[i] in _PREDIRS:
                pairs.append((tokens[i], "B-POSTDIR"))
                i += 1
            continue

        # Default: street name token
        label = "B-STR" if not street_name_started else "I-STR"
        pairs.append((tok, label))
        street_name_started = True
        in_street_name = True
        i += 1

    # ── City ────────────────────────────────────────────────
    city_tokens = _tokenize_address(city_raw)
    for j, tok in enumerate(city_tokens):
        if re.match(r"[A-Z]", tok):
            pairs.append((tok, "B-CITY" if j == 0 else "I-CITY"))

    # ── State ───────────────────────────────────────────────
    if state_raw in _US_STATES:
        pairs.append((state_raw, "B-STATE"))

    # ── ZIP ─────────────────────────────────────────────────
    zip_digits = re.sub(r"\D", "", zip_raw)
    if len(zip_digits) >= 5:
        pairs.append((zip_digits[:5], "B-ZIP5"))
        if len(zip_digits) == 9:
            pairs.append((zip_digits[5:], "B-ZIP4"))
    elif re.match(r"\d{5}-\d{4}", zip_raw):
        parts = zip_raw.split("-")
        pairs.append((parts[0], "B-ZIP5"))
        pairs.append((parts[1], "B-ZIP4"))

    return pairs


# ──────────────────────────────────────────────────────────────
# Data loading
# ──────────────────────────────────────────────────────────────

def load_from_csv(path: str) -> pd.DataFrame:
    """Load addresses from CSV (columns: street, city, state, zip)."""
    df = pd.read_csv(path)
    # Normalise column names
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    rename = {
        "address":         "street",
        "address_line_1":  "street",
        "street_address":  "street",
        "postal_code":     "zip",
        "zipcode":         "zip",
        "zip_code":        "zip",
        "state_code":      "state",
    }
    df.rename(columns={k: v for k, v in rename.items() if k in df.columns}, inplace=True)
    for col in ("street", "city", "state", "zip"):
        if col not in df.columns:
            df[col] = ""
    return df[["street", "city", "state", "zip"]].dropna(how="all")


def load_from_databricks(databricks_host: str, databricks_token: str,
                          warehouse_id: str, catalog: str, limit: int) -> pd.DataFrame:
    """Load labeled training data from Databricks ml.training_data table."""
    try:
        from databricks import sql as dbsql

        conn = dbsql.connect(
            server_hostname=databricks_host,
            http_path=f"/sql/1.0/warehouses/{warehouse_id}",
            access_token=databricks_token,
        )
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT raw_address, correct_street, correct_city, correct_state, correct_zip
            FROM {catalog}.ml.training_data
            LIMIT {limit}
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows, columns=["raw", "street", "city", "state", "zip"])
        return df[["street", "city", "state", "zip"]].dropna(how="all")

    except Exception as exc:
        log.warning("Databricks load failed (%s) — falling back to CSV/synthetic.", exc)
        return pd.DataFrame()


def build_token_label_pairs(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame of addresses into BIO-tagged examples."""
    examples = []
    for _, row in df.iterrows():
        addr = {"street": row.get("street", ""), "city": row.get("city", ""),
                "state": row.get("state", ""), "zip": row.get("zip", "")}
        tagged = auto_tag(addr)
        if len(tagged) < 3:
            continue
        tokens, labels = zip(*tagged)
        examples.append({"tokens": list(tokens), "ner_tags": list(labels)})
    return examples


# ──────────────────────────────────────────────────────────────
# HuggingFace dataset construction
# ──────────────────────────────────────────────────────────────

def build_hf_dataset(examples: list[dict], tokenizer) -> DatasetDict:
    """
    Build a HuggingFace DatasetDict with train/validation splits.
    Aligns word-level labels to sub-word tokens produced by the tokenizer.
    """
    label_feature = Sequence(ClassLabel(names=LABEL_NAMES))

    raw_ds = Dataset.from_list(examples)
    raw_ds = raw_ds.cast_column("ner_tags", label_feature)

    def tokenize_and_align(batch):
        enc = tokenizer(
            batch["tokens"],
            is_split_into_words=True,
            truncation=True,
            max_length=128,
            padding=False,
        )
        all_labels = []
        for i, labels in enumerate(batch["ner_tags"]):
            word_ids    = enc.word_ids(batch_index=i)
            label_ids   = []
            prev_word   = None
            for wid in word_ids:
                if wid is None:
                    label_ids.append(-100)
                elif wid != prev_word:
                    label_ids.append(labels[wid])
                else:
                    # Continuation sub-word: convert B- → I-
                    orig_lbl = LABEL_NAMES[labels[wid]]
                    cont_lbl = orig_lbl.replace("B-", "I-") if orig_lbl.startswith("B-") else orig_lbl
                    label_ids.append(LABEL2ID.get(cont_lbl, LABEL2ID["O"]))
                prev_word = wid
            all_labels.append(label_ids)
        enc["labels"] = all_labels
        return enc

    tokenized = raw_ds.map(
        tokenize_and_align,
        batched=True,
        remove_columns=raw_ds.column_names,
    )

    split = tokenized.train_test_split(test_size=0.1, seed=42)
    return DatasetDict({"train": split["train"], "validation": split["test"]})


# ──────────────────────────────────────────────────────────────
# Training
# ──────────────────────────────────────────────────────────────

def compute_metrics_fn(p, metric):
    predictions, labels = p
    predictions = np.argmax(predictions, axis=2)

    true_preds  = [[LABEL_NAMES[p] for p, l in zip(pred, label) if l != -100]
                   for pred, label in zip(predictions, labels)]
    true_labels = [[LABEL_NAMES[l] for p, l in zip(pred, label) if l != -100]
                   for pred, label in zip(predictions, labels)]

    results = metric.compute(predictions=true_preds, references=true_labels)
    return {
        "precision": results["overall_precision"],
        "recall":    results["overall_recall"],
        "f1":        results["overall_f1"],
        "accuracy":  results["overall_accuracy"],
    }


def train(args: argparse.Namespace) -> None:
    log.info("Base model: %s", args.model_name)
    log.info("Output dir: %s", args.output_dir)

    # ── Load tokenizer + model ───────────────────────────────
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForTokenClassification.from_pretrained(
        args.model_name,
        num_labels=len(LABEL_NAMES),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,   # CoNLL-2003 has 9 labels; we have 20
    )

    # ── Load training data ───────────────────────────────────
    df = pd.DataFrame()

    if args.databricks_host:
        log.info("Loading data from Databricks …")
        df = load_from_databricks(
            databricks_host=args.databricks_host,
            databricks_token=args.databricks_token,
            warehouse_id=args.databricks_warehouse_id,
            catalog=args.databricks_catalog,
            limit=args.max_samples,
        )

    if df.empty and args.data_path and Path(args.data_path).exists():
        log.info("Loading data from CSV: %s", args.data_path)
        df = load_from_csv(args.data_path)

    if df.empty:
        log.warning("No labeled data found — generating synthetic training data …")
        synthetic = _generate_synthetic(n=args.synthetic_samples)
        df = pd.DataFrame(synthetic)

    log.info("Total training addresses: %d", len(df))

    examples = build_token_label_pairs(df)
    log.info("Converted to %d valid examples.", len(examples))

    dataset = build_hf_dataset(examples, tokenizer)
    log.info("Train: %d  Validation: %d",
             len(dataset["train"]), len(dataset["validation"]))

    # ── Training arguments ───────────────────────────────────
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        logging_steps=50,
        report_to="none",
        fp16=torch.cuda.is_available(),
    )

    seqeval = load_metric("seqeval")
    collator = DataCollatorForTokenClassification(tokenizer)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        tokenizer=tokenizer,
        data_collator=collator,
        compute_metrics=lambda p: compute_metrics_fn(p, seqeval),
    )

    log.info("Starting training …")
    trainer.train()

    # ── Save final model ─────────────────────────────────────
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    log.info("Model saved to: %s", args.output_dir)

    # Save label map for inference
    label_map_path = Path(args.output_dir) / "label_map.json"
    label_map_path.write_text(json.dumps({
        "id2label": ID2LABEL,
        "label2id": LABEL2ID,
        "label_names": LABEL_NAMES,
    }, indent=2))
    log.info("Label map saved: %s", label_map_path)

    # ── Final evaluation ─────────────────────────────────────
    metrics = trainer.evaluate()
    log.info("Final eval metrics: %s", metrics)

    metrics_path = Path(args.output_dir) / "eval_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2))


# ──────────────────────────────────────────────────────────────
# Synthetic data generator (fallback)
# ──────────────────────────────────────────────────────────────

def _generate_synthetic(n: int = 2000) -> list[dict]:
    """
    Generate synthetic USPS-format addresses for bootstrapping.
    Covers the most common address patterns seen in postal data.
    """
    import random
    rng = random.Random(42)

    street_names  = ["MAIN", "OAK", "MAPLE", "CEDAR", "ELM", "PINE", "PARK",
                     "LAKE", "HILL", "RIDGE", "VALLEY", "RIVER", "SPRING",
                     "FOREST", "SUMMIT", "MEADOW", "LINCOLN", "WASHINGTON",
                     "JEFFERSON", "ADAMS", "JACKSON", "HARRISON", "FRANKLIN"]
    suffixes      = list(_STREET_SUFFIXES)[:12]
    predirs       = ["N", "S", "E", "W", "NE", "NW", "SE", "SW", ""]
    cities        = ["SPRINGFIELD", "CHICAGO", "ROCKFORD", "AURORA", "ELGIN",
                     "JOLIET", "PEORIA", "WAUKEGAN", "CHAMPAIGN", "NAPERVILLE",
                     "ARLINGTON HTS", "EVANSTON", "DECATUR", "BLOOMINGTON"]
    states        = list(_US_STATES)[:15]
    sec_units     = ["APT", "STE", "UNIT", "BLDG", "FL", ""]

    records = []
    for _ in range(n):
        num     = str(rng.randint(1, 9999))
        predir  = rng.choice(predirs)
        name    = rng.choice(street_names)
        suffix  = rng.choice(suffixes)
        sec     = rng.choice(sec_units)
        sec_num = str(rng.randint(1, 500)) if sec else ""
        city    = rng.choice(cities)
        state   = rng.choice(states)
        zip5    = str(rng.randint(0, 99999)).zfill(5)   # zfill ensures Puerto Rico/leading-zero ZIPs

        street_parts = [p for p in [num, predir, name, suffix, sec, sec_num] if p]
        street = " ".join(street_parts)

        records.append({"street": street, "city": city, "state": state, "zip": zip5})
    return records


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fine-tune BERT NER for USPS address parsing")
    p.add_argument("--model-name",    default="dslim/bert-base-NER",
                   help="HuggingFace model Hub ID or local path")
    p.add_argument("--output-dir",    default="/opt/ml/model",
                   help="Directory to save the trained model")
    p.add_argument("--data-path",     default="",
                   help="Path to CSV file with columns: street, city, state, zip")
    p.add_argument("--epochs",        type=int,   default=5)
    p.add_argument("--batch-size",    type=int,   default=16)
    p.add_argument("--learning-rate", type=float, default=3e-5)
    p.add_argument("--max-samples",   type=int,   default=50000,
                   help="Max rows to load from Databricks")
    p.add_argument("--synthetic-samples", type=int, default=5000,
                   help="Synthetic training examples when no real data available")

    # Databricks connection (optional)
    p.add_argument("--databricks-host",         default=os.getenv("DATABRICKS_HOST", ""))
    p.add_argument("--databricks-token",        default=os.getenv("DATABRICKS_TOKEN", ""),
                   help="Databricks PAT token")
    p.add_argument("--databricks-warehouse-id", default=os.getenv("DATABRICKS_WAREHOUSE_ID", ""))
    p.add_argument("--databricks-catalog",      default=os.getenv("DATABRICKS_CATALOG", "addresses"))

    return p.parse_args()


if __name__ == "__main__":
    train(parse_args())
