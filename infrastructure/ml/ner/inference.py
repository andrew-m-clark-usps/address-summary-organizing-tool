"""
inference.py — SageMaker model serving for the fine-tuned USPS address NER model.

SageMaker calls model_fn() once on cold start, then predict_fn() per request.

Input JSON (single or batched):
  Single:  { "inputs": "123 N Main St Apt 4B Springfield IL 62701" }
  Batch:   { "inputs": ["123 N Main St", "456 Oak Ave Chicago IL 60601"] }

Output JSON (mirrors HuggingFace token-classification pipeline output):
  [
    {
      "input":    "123 N Main St Apt 4B Springfield IL 62701",
      "entities": [
        { "entity": "B-NUM",    "word": "123",         "score": 0.999, "start": 0,  "end": 3  },
        { "entity": "B-PREDIR", "word": "N",           "score": 0.995, "start": 4,  "end": 5  },
        { "entity": "B-STR",    "word": "Main",        "score": 0.991, "start": 6,  "end": 10 },
        { "entity": "B-SUF",    "word": "St",          "score": 0.988, "start": 11, "end": 13 },
        { "entity": "B-SEC",    "word": "Apt",         "score": 0.993, "start": 14, "end": 17 },
        { "entity": "B-SECNUM", "word": "4B",          "score": 0.987, "start": 18, "end": 20 },
        { "entity": "B-CITY",   "word": "Springfield", "score": 0.996, "start": 21, "end": 32 },
        { "entity": "B-STATE",  "word": "IL",          "score": 0.999, "start": 33, "end": 35 },
        { "entity": "B-ZIP5",   "word": "62701",       "score": 0.999, "start": 36, "end": 41 }
      ],
      "structured": {
        "street":     "123 N MAIN ST APT 4B",
        "streetNum":  "123",
        "preDir":     "N",
        "streetName": "MAIN",
        "suffix":     "ST",
        "secUnit":    "APT",
        "secUnitNum": "4B",
        "city":       "SPRINGFIELD",
        "state":      "IL",
        "zip5":       "62701",
        "zip4":       null
      },
      "confidence": 0.994
    }
  ]

This handler is compatible with both:
  - SageMaker Real-time Endpoints
  - SageMaker Serverless Inference
"""

import json
import logging
import os
from typing import Any

import torch
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    pipeline,
)

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# SageMaker entry points
# ──────────────────────────────────────────────────────────────

def model_fn(model_dir: str) -> dict:
    """
    Load the fine-tuned NER model and tokenizer from the SageMaker model
    directory (/opt/ml/model).  Called once on container start.
    """
    log.info("Loading model from: %s", model_dir)

    device = 0 if torch.cuda.is_available() else -1

    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model     = AutoModelForTokenClassification.from_pretrained(model_dir)

    nlp = pipeline(
        "token-classification",
        model=model,
        tokenizer=tokenizer,
        aggregation_strategy="simple",   # merge sub-word tokens into words
        device=device,
    )

    # Load label map saved during training
    label_map_path = os.path.join(model_dir, "label_map.json")
    label_map = {}
    if os.path.exists(label_map_path):
        with open(label_map_path) as f:
            label_map = json.load(f)

    log.info("Model loaded successfully (device=%d).", device)
    return {"pipeline": nlp, "label_map": label_map}


def input_fn(request_body: str, content_type: str = "application/json") -> list[str]:
    """Parse the incoming request payload into a list of address strings."""
    if content_type != "application/json":
        raise ValueError(f"Unsupported content type: {content_type}")

    data = json.loads(request_body)
    inputs = data.get("inputs", data)

    if isinstance(inputs, str):
        return [inputs]
    if isinstance(inputs, list):
        return [str(i) for i in inputs]
    raise ValueError("Expected 'inputs' to be a string or list of strings.")


def predict_fn(addresses: list[str], model_artifacts: dict) -> list[dict]:
    """
    Run NER inference and return structured address components.
    """
    nlp = model_artifacts["pipeline"]
    results = []

    for address in addresses:
        raw_entities = nlp(address)
        structured   = _assemble_structured(raw_entities, address)
        confidence   = _compute_confidence(raw_entities)

        results.append({
            "input":      address,
            "entities":   _format_entities(raw_entities),
            "structured": structured,
            "confidence": confidence,
        })

    return results


def output_fn(predictions: list[dict], accept: str = "application/json") -> tuple[str, str]:
    """Serialize predictions to JSON."""
    return json.dumps(predictions), "application/json"


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _format_entities(raw_entities: list[dict]) -> list[dict]:
    """Normalise the HuggingFace pipeline entity output."""
    return [
        {
            "entity": e.get("entity_group", e.get("entity", "O")),
            "word":   e.get("word", "").strip(),
            "score":  round(float(e.get("score", 0)), 4),
            "start":  e.get("start"),
            "end":    e.get("end"),
        }
        for e in (raw_entities or [])
        if e.get("word", "").strip()
    ]


def _assemble_structured(entities: list[dict], address: str) -> dict:
    """
    Convert the flat list of BIO entities into a structured address dict.
    Groups multi-token entities (I-* continuation tokens) into single strings.
    """
    groups: dict[str, list[str]] = {}
    for ent in entities:
        key  = (ent.get("entity_group") or ent.get("entity", "O")).replace("B-", "").replace("I-", "")
        word = ent.get("word", "").strip()
        if key and word:
            groups.setdefault(key, []).append(word)

    def join(key: str) -> str | None:
        words = groups.get(key)
        return " ".join(words).upper() if words else None

    # Rebuild street from components
    num      = join("NUM")
    predir   = join("PREDIR")
    str_name = join("STR")
    suffix   = join("SUF")
    postdir  = join("POSTDIR")
    sec      = join("SEC")
    sec_num  = join("SECNUM")

    street_parts = [p for p in [num, predir, str_name, suffix, postdir, sec, sec_num] if p]

    return {
        "street":     " ".join(street_parts) or None,
        "streetNum":  num,
        "preDir":     predir,
        "streetName": str_name,
        "suffix":     suffix,
        "postDir":    postdir,
        "secUnit":    sec,
        "secUnitNum": sec_num,
        "city":       join("CITY"),
        "state":      join("STATE"),
        "zip5":       join("ZIP5"),
        "zip4":       join("ZIP4"),
    }


def _compute_confidence(entities: list[dict]) -> float:
    """Average entity score, rounded to 4 decimal places."""
    if not entities:
        return 0.0
    scores = [float(e.get("score", 0)) for e in entities]
    return round(sum(scores) / len(scores), 4)
