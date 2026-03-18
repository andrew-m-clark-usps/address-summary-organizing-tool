# AI Integration Plan — USPS Address Management Portal

**Version:** 2.0  
**Date:** 2026-03-18  
**Author:** Address Analysis Engineering Team  

---

## Executive Summary

The USPS Address Management Portal performs client-side address matching using rule-based exact and fuzzy algorithms (Levenshtein distance, ZIP/state weighting). While effective for structured datasets, this approach has inherent limitations: it does not learn from corrections, cannot parse unstructured address strings, and scales poorly beyond ~100k records per browser session.

Integrating AI and ML capabilities transforms the pipeline in four high-value ways:

1. **Higher match accuracy** — learned embeddings outperform edit-distance on abbreviated/non-standard addresses.
2. **Automated standardization** — NLP models resolve "123 N. Main St Apt 4B" → USPS canonical form without manual rules.
3. **Proactive data quality** — anomaly detection flags suspicious records *before* they corrupt match results.
4. **Natural language reporting** — LLM-generated narrative summaries replace manual slide preparation.

All five phases below can be adopted incrementally; each phase delivers standalone value independent of the others.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI-Enhanced Pipeline                         │
│                                                                     │
│  ┌──────────┐   ┌──────────────────┐   ┌──────────────────────┐   │
│  │  Data    │──▶│  Phase 1:        │──▶│  Phase 2:            │   │
│  │ Ingestion│   │  AI Address      │   │  ML-Based Fuzzy      │   │
│  │ CSV/XLSX │   │  Standardization │   │  Matching            │   │
│  └──────────┘   └──────────────────┘   └──────────────────────┘   │
│                          │                         │               │
│                          ▼                         ▼               │
│                 ┌──────────────────┐   ┌──────────────────────┐   │
│                 │  Phase 3:        │   │  Phase 4:            │   │
│                 │  Anomaly         │──▶│  Analytics Engine    │   │
│                 │  Detection       │   │  + Dashboard         │   │
│                 └──────────────────┘   └──────────────────────┘   │
│                                                   │               │
│                                                   ▼               │
│                                       ┌──────────────────────┐   │
│                                       │  Phase 4:            │   │
│                                       │  LLM Reporting       │   │
│                                       └──────────────────────┘   │
│                                                   │               │
│                                                   ▼               │
│                                       ┌──────────────────────┐   │
│                                       │  Phase 5:            │   │
│                                       │  Continuous Learning │   │
│                                       │  & Feedback Loop     │   │
│                                       └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: AI-Powered Address Standardization

### Problem
Raw address strings arrive in inconsistent formats:  
`"123 north main street apartment 4B"` vs `"123 N MAIN ST APT 4B"` vs `"123 N Main St #4B"`

The current rule-based abbreviation map handles common cases but misses misspellings, abbreviation variants, and international postal formats.

### Solution

#### 1A. NLP-Based Address Parsing
Use Named Entity Recognition (NER) to decompose a full address string into structured components (street number, pre-directional, street name, suffix, secondary unit, city, state, ZIP).

**Recommended Options:**
- **spaCy (self-hosted)** — Open-source NLP library with custom NER pipeline (runs locally, no external dependencies)
- **Hugging Face Transformers** — Pre-trained models fine-tuned on address data (runs locally via ONNX)
- **libpostal** — Open-source international address parser (ideal for local/on-premise deployment)

**Implementation Approach:**

```javascript
// Example: Using a locally-hosted NER endpoint (e.g., spaCy server)
async function parseAddress(rawAddress) {
  const response = await fetch('http://localhost:8001/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: rawAddress })
  });
  return response.json();
  // Returns: { street_number, street_name, suffix, unit, city, state, zip }
}
```

#### 1B. USPS-Style Normalization (Rule-Based Fallback)
The existing `standardize()` function in `js/matcher.js` already handles common abbreviations. Extend it with:
- Soundex phonetic matching for street name typos
- N-gram similarity for abbreviation variants
- Secondary unit normalization (APT/UNIT/STE/FL)

---

## Phase 2: ML-Based Fuzzy Matching

### Problem
Current Levenshtein + component-weight scoring treats all mismatches equally. A single-character typo in a street name should score differently from a completely wrong street name.

### Solution

#### 2A. Sentence Embeddings for Semantic Similarity
Train or fine-tune a sentence transformer on address pairs labeled as match/no-match. The model learns that "123 Elm St" and "123 Elm Street" are semantically identical while "123 Elm St" and "321 Elm St" are not.

**Local Options:**
- **sentence-transformers** (Python, runs on CPU) — Use `all-MiniLM-L6-v2` as a base model
- **ONNX Runtime** — Export the model to ONNX for fast JavaScript inference via `onnxruntime-web`
- **TensorFlow.js** — Run small models directly in the browser Web Worker

```javascript
// In matcherWorker.js — inference via ONNX Runtime Web
import * as ort from 'onnxruntime-web';
const session = await ort.InferenceSession.create('/models/address_matcher.onnx');

async function semanticScore(addrA, addrB) {
  const inputA = tokenize(addrA);
  const inputB = tokenize(addrB);
  const result = await session.run({ input_a: inputA, input_b: inputB });
  return result.similarity.data[0]; // 0–1 cosine similarity
}
```

#### 2B. XGBoost Classifier (Feature-Based)
Extract features from address pairs and train a gradient-boosted classifier to predict match probability:

| Feature | Description |
|---------|-------------|
| `zip_exact` | Binary: ZIPs match exactly |
| `street_levenshtein` | Normalized edit distance |
| `city_jaro_winkler` | Jaro-Winkler similarity |
| `state_match` | Binary: states match |
| `geo_distance_km` | Haversine distance (if lat/lon available) |
| `street_token_overlap` | Jaccard of street tokens |
| `soundex_match` | Phonetic street name match |

Train locally using scikit-learn, export to ONNX or a JSON model loadable in JavaScript.

---

## Phase 3: Anomaly Detection

### Problem
Large datasets contain records that appear plausible but are statistical outliers — likely data entry errors, system migration artifacts, or duplicates with slight variations.

### Solution

#### 3A. Isolation Forest (Unsupervised)
Train an Isolation Forest on address features to detect anomalies:
- ZIP codes inconsistent with city/state combinations
- Geocoordinates far outside expected state boundaries
- Unusually long or short address strings
- Non-standard character sequences

```python
# Local Python script — runs offline
from sklearn.ensemble import IsolationForest
import pandas as pd

df = pd.read_csv('addresses.csv')
features = df[['zip_numeric', 'lat', 'lon', 'street_length', 'has_secondary_unit']]
iso = IsolationForest(contamination=0.02, random_state=42)
df['anomaly_score'] = iso.fit_predict(features)
df[df['anomaly_score'] == -1].to_csv('flagged_anomalies.csv')
```

#### 3B. Rule-Based Heuristics (Built Into the Portal)
The portal already implements several quality checks — extend them with:
- ZIP/city cross-validation against a local ZCTA lookup table
- State/lat-lon bounding box validation
- Duplicate detection using MinHash LSH for fuzzy deduplication

---

## Phase 4: LLM-Powered Reporting

### Problem
After analysis, administrators must manually interpret metrics and write executive summaries. This is time-consuming and introduces inconsistency.

### Solution

#### 4A. Local LLM (Fully On-Premise)
Run a small language model locally for generating summaries — no data leaves the machine:

**Options:**
- **Ollama** — Run Llama 3, Mistral, or Phi-3 locally via `http://localhost:11434`
- **LM Studio** — Desktop app with local API server
- **llama.cpp** — C++ inference engine, callable from Node.js

```javascript
// Connect to a locally-running Ollama instance
async function generateSummary(metrics) {
  const prompt = `
    Analyze these address matching results and write a 3-sentence executive summary:
    - Total records: ${metrics.totalRecords}
    - Match rate: ${(metrics.matchRate * 100).toFixed(1)}%
    - F1 Score: ${metrics.f1.toFixed(3)}
    - Precision: ${metrics.precision.toFixed(3)}
    - Recall: ${metrics.recall.toFixed(3)}
  `;
  
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model: 'llama3', prompt, stream: false })
  });
  const data = await response.json();
  return data.response;
}
```

#### 4B. Integration with the Portal
Add a "Generate Report" button to the Analysis Dashboard that:
1. Extracts key metrics from the analysis results
2. Calls the locally-running LLM endpoint
3. Displays the narrative in a collapsible card
4. Allows copy/paste for use in external reports

---

## Phase 5: Continuous Learning & Feedback Loop

### Problem
The matching algorithm uses static weights. Over time, as users correct mismatches, those corrections should improve future predictions.

### Solution

#### 5A. User Feedback Collection
Add "Mark as Correct / Incorrect" buttons on matched address pairs. Store feedback in IndexedDB.

#### 5B. Periodic Model Retraining
Export accumulated feedback as labeled training data. Retrain the XGBoost or embedding model locally. Import the updated ONNX model back into the portal.

```javascript
// Export feedback for retraining
const exportFeedback = async () => {
  const feedback = await localforage.getItem('match_feedback') || [];
  const csv = Papa.unparse(feedback);
  downloadFile(csv, 'training_data.csv', 'text/csv');
};
```

#### 5C. Score Drift Monitoring
Track the distribution of match scores over time. Store weekly snapshots in IndexedDB. Visualize drift in the Analysis Dashboard.

---

## Implementation Roadmap

| Phase | Capability | Approach | Effort |
|-------|-----------|----------|--------|
| 1 | Address Parsing | spaCy local server or libpostal | 2–3 weeks |
| 1 | Normalization | Extend existing `standardize()` | 1 week |
| 2 | Semantic Similarity | ONNX model in Web Worker | 3–4 weeks |
| 2 | Feature-Based ML | XGBoost → ONNX export | 2–3 weeks |
| 3 | Anomaly Detection | scikit-learn local script | 1–2 weeks |
| 3 | ZIP/city validation | ZCTA lookup table | 1 week |
| 4 | LLM Summaries | Ollama local integration | 1–2 weeks |
| 5 | Feedback loop | IndexedDB + export | 2–3 weeks |

---

## Privacy & Security

Address data constitutes Personally Identifiable Information (PII).

**Principles followed in this plan:**
- All AI inference runs locally or on-premise — no address data is sent to external APIs.
- No third-party cloud AI services are required.
- LLM summaries use only aggregate metrics, never individual address records.
- ONNX/TensorFlow.js models run in the browser or a local server — no network egress.
- Feedback and training data stored in IndexedDB remain on the user's machine.

**If an external LLM API is ever used:**
- Send only aggregate statistics, never raw addresses.
- Review the provider's data processing agreement.
- Use an on-premise or government-authorized API endpoint when required.

---

*This document is intended as a living reference. Update it as capabilities are evaluated and implementation priorities evolve.*
