# AI Integration Plan — Address Summary Organizing Tool

**Version:** 1.0  
**Date:** 2026-03-18  
**Author:** Address Analysis Engineering Team  

---

## Executive Summary

The Address Summary Organizing Tool currently performs client-side address matching using rule-based exact and fuzzy algorithms (Levenshtein distance, ZIP/state weighting). While effective for structured datasets, this approach has inherent limitations: it does not learn from corrections, cannot parse unstructured address strings, and scales poorly beyond ~100k records per browser session.

Integrating AI and ML services transforms the pipeline in four high-value ways:

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
│                                       │  (GPT/Claude)        │   │
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

**Recommended Services:**
- **Azure AI Language** — Custom NER with USPS-specific training data
- **AWS Comprehend** — Custom entity recognition endpoint
- **Google Cloud Natural Language API** — Syntax parsing + custom entity model
- **spaCy (self-hosted)** — Open-source NLP library with custom NER pipeline (zero API cost)

**Implementation Approach:**
```
Input:  "123 north main street apartment 4B, Springfield, IL 62701"
Model:  Custom NER (trained on USPS address corpus)
Output: {
  "streetNumber": "123",
  "preDir": "N",
  "streetName": "MAIN",
  "suffix": "ST",
  "secUnit": "APT",
  "secUnitNum": "4B",
  "city": "SPRINGFIELD",
  "state": "IL",
  "zip5": "62701"
}
```

#### 1B. USPS Address Validation API (CASS/AMS)
After parsing, validate and canonicalize via the USPS Address Management System (AMS):
- **USPS Web Tools API** — Free for non-commercial use; returns standardized address + ZIP+4
- **USPS CASS-Certified Vendors** — Melissa Data, SmartyStreets, Lob — batch processing at scale
- **EWSFiles (Early Warning System)** — USPS deliverability flag

#### 1C. Training Data Requirements
- Minimum 10,000 labeled address pairs (raw → USPS canonical)
- Augment with USPS AIS (Address Information System) sample extracts
- Include edge cases: PO Box, Rural Route, Highway Contract Route, APO/FPO/DPO

### Expected Improvement
- Standardization coverage: 95%+ (up from ~70% with rule-based)
- False-negative rate reduction: ~30% fewer missed matches due to format differences

---

## Phase 2: ML-Based Fuzzy Matching

### Problem
Levenshtein distance treats all character substitutions equally. "123 N Main St" vs "123 North Main St" scores poorly despite being an obvious match. Learned representations capture semantic similarity.

### Solution

#### 2A. Sentence-BERT / Address Embeddings
Replace string similarity with dense vector embeddings for street-name comparison:

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('paraphrase-MiniLM-L6-v2')  # 80MB, fast

def street_similarity(a: str, b: str) -> float:
    emb_a = model.encode(a, normalize_embeddings=True)
    emb_b = model.encode(b, normalize_embeddings=True)
    return float(emb_a @ emb_b)  # cosine similarity
```

**Alternative:** Fine-tune a lightweight BERT model on USPS address pairs for domain-specific embeddings.

#### 2B. XGBoost/LightGBM Match Classifier
Train a binary classifier on labeled match/non-match pairs. Features include:

| Feature | Description |
|---------|-------------|
| `zip_match` | 1 if ZIP codes match, 0.5 if first 3 digits match |
| `state_match` | 1 if states match |
| `city_embedding_sim` | Cosine similarity of city name embeddings |
| `street_embedding_sim` | Cosine similarity of street embeddings |
| `number_exact` | 1 if street numbers are identical |
| `secondary_unit_present` | Binary flags for APT/STE/UNIT |
| `zip_plus4_match` | 1 if ZIP+4 matches exactly |

**Training Data:** Export matched/unmatched records from the current tool + manual review labels.

#### 2C. TF-IDF + Cosine Similarity for City Names
For large city-name vocabularies, TF-IDF vectorization + cosine similarity outperforms Levenshtein at scale:

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

vectorizer = TfidfVectorizer(analyzer='char', ngram_range=(2,3))
tfidf_matrix = vectorizer.fit_transform(city_list)
similarities = cosine_similarity(query_vec, tfidf_matrix)
```

### Expected Improvement
- Precision increase: +8–15% on abbreviation-heavy datasets
- Recall increase: +5–10% on non-standard address formats
- Processing time: Batch inference with ONNX runtime — comparable to current Levenshtein at scale

---

## Phase 3: Anomaly Detection & Data Quality

### Problem
Duplicate addresses, invalid ZIPs, and outlier coordinates contaminate match results. Manual review of large datasets is infeasible.

### Solution

#### 3A. Isolation Forest for Record-Level Anomaly Detection
Detects anomalous records based on feature vectors (field completeness, ZIP validity, state frequency deviation):

```python
from sklearn.ensemble import IsolationForest

features = extract_features(records)  # completeness, validity flags, etc.
model = IsolationForest(contamination=0.05, random_state=42)
labels = model.fit_predict(features)  # -1 = anomaly, 1 = normal
```

#### 3B. DBSCAN Geographic Clustering
Geocode addresses (lat/long) and apply DBSCAN to find records that are geographically isolated from their ZIP code's centroid — these are likely data entry errors.

```python
from sklearn.cluster import DBSCAN
import numpy as np

coords = np.array([[lat, lon] for lat, lon in geocoded_records])
clustering = DBSCAN(eps=0.1, min_samples=5, metric='haversine')
clustering.fit(np.radians(coords))
outliers = [i for i, label in enumerate(clustering.labels_) if label == -1]
```

#### 3C. LLM-Based Address Correction Suggestions
For records flagged as anomalous, send to GPT-4 / Claude with a structured prompt:

```
System: You are a USPS address validation assistant. Given a potentially invalid 
        address, suggest the most likely corrected form. Return JSON only.
User:   Address: "123 Elm Stret, Chicagoo, IL 60601"
AI:     {"corrected": "123 ELM ST, CHICAGO, IL 60601", "confidence": 0.92, 
         "changes": ["street suffix typo: Stret->ST", "city typo: Chicagoo->CHICAGO"]}
```

### Expected Improvement
- Anomaly detection precision: 85–92% (vs ~40% with rule-based ZIP/state validation)
- Correction acceptance rate: 70–80% for single-field typos
- Processing cost: ~$0.002/record for GPT-4o-mini at 10k record volume

---

## Phase 4: Automated Reporting & Insights

### Problem
Generating executive summaries and PowerPoint presentations from analysis results is time-consuming and requires manual interpretation of metrics.

### Solution

#### 4A. LLM-Generated Narrative Summaries
After analysis completes, send the AI metrics JSON to an LLM to produce a natural language executive summary:

```javascript
// client-side API call (requires API key management)
const prompt = `
You are an address data quality analyst. Given these match statistics, 
write a 3-paragraph executive summary highlighting key findings, risks, 
and recommendations. Focus on actionable insights.

Data: ${JSON.stringify(analysisMetrics)}
`;
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }]
});
```

**Output example:**
> "The analysis matched 87.3% of System A records to System B, with 12,450 perfect (exact) matches representing 62% of all matches. Three areas require attention: (1) 423 records in System A show cross-state mismatches indicating possible data migration errors; (2) the Gini coefficient of 0.41 suggests uneven match quality distribution, concentrated in ZIP codes 60601–60699; (3) System B's data quality score of 71.2% is below the recommended 80% threshold primarily due to 8.3% duplicate rate..."

#### 4B. Key Findings Auto-Generation
Programmatically generate bullet-point findings from metric thresholds:

```javascript
function generateKeyFindings(aiMetrics, matchDetails) {
  const findings = [];
  if (aiMetrics.f1Score < 70) findings.push('F1 Score below 70% — review matching threshold settings');
  if (aiMetrics.dqScoreA < 75) findings.push('System A data quality needs improvement (score: ' + aiMetrics.dqScoreA + '%)');
  if (matchDetails.crossStateMatchCount > 100) findings.push(matchDetails.crossStateMatchCount + ' cross-state matches detected — verify data sources');
  if (aiMetrics.giniCoefficient > 0.4) findings.push('High score variance (Gini: ' + aiMetrics.giniCoefficient + ') — matching quality is inconsistent across records');
  return findings;
}
```

#### 4C. Auto-Generate Executive Summary Slides
Extend the existing PowerPoint export with an LLM-generated narrative slide, pulling the summary text from Phase 4A.

---

## Phase 5: Continuous Learning Pipeline

### Problem
The matching algorithm uses fixed weights and thresholds. Performance degrades as address data patterns evolve (new abbreviations, ZIP code changes, city renames).

### Solution

#### 5A. User Feedback Loop
Add a "Mark as incorrect match" button to the Detailed Results table. Collect corrections:

```javascript
// Store in localStorage (client-side) or POST to feedback endpoint
function submitMatchCorrection(matchId, type) {
  // type: 'false_positive' | 'false_negative' | 'correct'
  const feedback = { matchId, type, timestamp: Date.now() };
  localStorage.setItem('feedback_' + matchId, JSON.stringify(feedback));
}
```

Export feedback as a labeled dataset for model retraining.

#### 5B. A/B Testing for Algorithm Variants
Run two matching configurations on the same dataset and compare precision/recall:

```javascript
const configA = { threshold: 70, weights: { zip: 40, state: 30, city: 20, street: 10 } };
const configB = { threshold: 65, weights: { zip: 35, state: 25, city: 25, street: 15 } };

const resultsA = AddressMatcher.matchRecords(dataA, dataB, configA);
const resultsB = AddressMatcher.matchRecords(dataA, dataB, configB);
// Compare F1 scores, precision, recall
```

#### 5C. Model Drift Monitoring
Track key metrics over time (weekly/monthly analysis runs) and alert when:
- F1 Score drops > 5 points from baseline
- Anomaly Rate increases > 2x from baseline
- Data Quality Score drops > 10 points

Store historical metrics in localStorage or an external time-series store (e.g., Azure Monitor, AWS CloudWatch).

#### 5D. Automated Retraining Schedule
- **Weekly:** Retrain TF-IDF vectorizer on updated city name vocabulary
- **Monthly:** Retrain XGBoost classifier on accumulated labeled pairs
- **Quarterly:** Fine-tune NER model on new USPS AIS extracts + user corrections

---

## Recommended Services

| Phase | Service | Provider | Purpose | Pricing Tier |
|-------|---------|----------|---------|-------------|
| 1 | Custom NER | Azure AI Language | Address component extraction | Pay-per-call |
| 1 | Address Validation API | USPS Web Tools | CASS standardization | Free (non-commercial) |
| 1 | CASS Processing | SmartyStreets | Batch ZIP+4 validation | $0.001–$0.003/record |
| 2 | Sentence-BERT | Self-hosted (ONNX) | Street embedding similarity | Free |
| 2 | ML Inference | AWS SageMaker | XGBoost classifier hosting | $0.06–$0.20/hr |
| 2 | ML Inference | Azure ML | Batch scoring endpoint | Pay-per-use |
| 3 | Anomaly Detection | Google Vertex AI | Isolation Forest as managed API | $0.002–$0.01/record |
| 3 | Geocoding | Google Maps API | Address to lat/long for DBSCAN | $0.005/request |
| 3 | Address Correction | OpenAI GPT-4o-mini | LLM-suggested corrections | $0.15/1M tokens |
| 4 | Narrative Summary | OpenAI GPT-4o | Executive summary generation | $5/1M tokens |
| 4 | Narrative Summary | Anthropic Claude 3 | Alternative LLM option | $3/1M tokens |
| 5 | Time-Series Metrics | Azure Monitor | Model drift tracking | Free tier available |
| 5 | MLOps Pipeline | Azure ML / AWS SageMaker | Model versioning & retraining | Pay-per-use |

---

## Cost Estimates

### Small Dataset (<10,000 records)
| Service | Monthly Cost |
|---------|-------------|
| USPS Address Validation (free tier) | $0 |
| OpenAI GPT-4o-mini (corrections + summary) | ~$1–$5 |
| Geocoding (optional, 10k calls) | ~$50 |
| **Total** | **~$5–$55/month** |

### Medium Dataset (10,000–100,000 records)
| Service | Monthly Cost |
|---------|-------------|
| SmartyStreets CASS ($0.002/record) | ~$20–$200 |
| AWS SageMaker inference (5 hrs/month) | ~$30 |
| OpenAI API (summaries + corrections) | ~$10–$50 |
| Google Geocoding (50k calls) | ~$250 |
| **Total** | **~$310–$530/month** |

### Large Dataset (100,000+ records)
| Service | Monthly Cost |
|---------|-------------|
| CASS vendor (bulk pricing) | ~$500–$2,000 |
| Azure ML batch scoring | ~$200–$800 |
| Self-hosted ONNX inference (avoid API costs) | ~$100/month (compute) |
| LLM API (summaries only) | ~$20–$100 |
| **Total** | **~$820–$2,900/month** |

> **Cost Optimization Tips:**
> - Use self-hosted spaCy NER + ONNX Sentence-BERT to eliminate most per-record API costs.
> - Cache USPS validation results by ZIP+4 to avoid re-calling for repeated addresses.
> - Batch LLM calls (send entire metrics JSON in one call rather than per-record).

---

## Security & Compliance

### PII Handling
Address data constitutes Personally Identifiable Information (PII) under CCPA, GDPR, and various state privacy laws.

**Requirements:**
- Encrypt address data at rest (AES-256) and in transit (TLS 1.2+).
- Do not log full address strings in application logs — use truncated or hashed identifiers.
- Implement data retention policies: purge uploaded files from browser memory within the session; avoid server-side storage without explicit user consent.
- When using cloud APIs (OpenAI, Azure, AWS), review their data processing agreements — most prohibit training on customer data by default, but verify for your use case.

### USPS Data Sensitivity
- USPS AIS (Address Information System) data is licensed. Redistribution and bulk export may require a data license agreement.
- CASS-certified processing vendors are bound by USPS Domestic Mail Manual (DMM) guidelines.
- Do not expose raw USPS AIS extract data in client-facing interfaces without proper licensing.

### FedRAMP Requirements
If deployed in a federal government context (e.g., USPS internal systems):
- All cloud services must use **FedRAMP Authorized** offerings.
- **Azure Government** (Azure AI Language — FedRAMP High)
- **AWS GovCloud** (SageMaker, Comprehend — FedRAMP High)
- **Google Cloud** (Vertex AI — FedRAMP Moderate, Government region)
- OpenAI / Anthropic APIs are **not FedRAMP authorized** — use Azure OpenAI Service (FedRAMP High) as a compliant alternative.
- Conduct a Privacy Impact Assessment (PIA) before processing address data containing names or other PII in cloud services.
- Follow NIST SP 800-53 controls for data classification, access control, and audit logging.

### Access Control
- Implement role-based access control (RBAC) for the analysis tool in organizational deployments.
- Audit logs must capture: who ran analysis, what files were uploaded (hash/size only), and when.
- API keys for cloud services must be managed via a secrets manager (Azure Key Vault, AWS Secrets Manager) — never embedded in client-side JavaScript.

---

## Implementation Roadmap

| Phase | Timeline | Dependencies | Complexity |
|-------|----------|-------------|------------|
| Phase 1A: NER parsing (spaCy, self-hosted) | 2–4 weeks | Training data (10k pairs) | Medium |
| Phase 1B: USPS validation API integration | 1–2 weeks | API key / data license | Low |
| Phase 2A: Sentence-BERT embeddings | 3–5 weeks | ONNX model packaging | Medium |
| Phase 2B: XGBoost classifier | 4–8 weeks | Labeled training dataset (5k+ pairs) | High |
| Phase 3A: Isolation Forest anomaly detection | 1–2 weeks | Feature engineering | Low–Medium |
| Phase 3C: LLM address correction | 1 week | OpenAI / Azure OpenAI API key | Low |
| Phase 4A: LLM narrative summary | 1–2 weeks | API key, prompt engineering | Low |
| Phase 5A: Feedback loop UI | 2–3 weeks | UI development + storage design | Medium |
| Phase 5C: Drift monitoring | 3–4 weeks | Metrics history storage | Medium |

---

*This document is intended as a living reference. Update it as services are evaluated, costs are validated, and implementation priorities shift.*
