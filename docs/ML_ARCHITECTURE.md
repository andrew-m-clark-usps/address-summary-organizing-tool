# ML Model Architecture — Address Verification Platform

**Version:** 2.0
**Date:** 2026-03-27
**Scope:** AWS Bedrock vs. Amazon SageMaker evaluation for USPS address verification use cases, full platform architecture, and implementation roadmap.

---

## 1. Executive Summary

Address verification at postal scale demands more than format-checking. The platform must handle:
- Freeform / unstructured address strings from varied data entry sources
- Messy, abbreviated, misspelled, or ambiguous records from legacy databases
- High-throughput batch validation of millions of Databricks-stored records
- Low-latency real-time validation for interactive user workflows
- Intelligent correction suggestions when USPS lookup fails or is ambiguous

Two AWS ML platforms are evaluated: **Amazon Bedrock** (foundation model API) and **Amazon SageMaker** (custom model training and deployment). The analysis below shows that they are **complementary, not competitive** — each excels at a distinct class of address verification task. The recommended architecture uses **both in a tiered pipeline**.

---

## 2. Amazon Bedrock — Evaluation

### 2.1 What It Is

Amazon Bedrock is a fully managed API for invoking pre-trained **foundation models (FMs)** from Amazon and third-party providers (Anthropic, Meta, Mistral, Cohere, AI21 Labs, Stability AI). No model training or infrastructure management is required.

**Available models relevant to address verification:**

| Model | Provider | Best Use in Address Context |
|---|---|---|
| Claude 3.5 Haiku | Anthropic | Fast, cheap freeform address parsing; correction suggestions |
| Claude 3 Sonnet | Anthropic | Complex multi-field NLP; multi-language addresses; chain-of-thought corrections |
| Claude 3 Opus | Anthropic | Hardest edge cases; APO/FPO/DPO military parsing; policy reasoning |
| Amazon Titan Text Lite | Amazon | Lightweight parsing, embedded in cost-sensitive pipelines |
| Amazon Titan Embeddings V2 | Amazon | Semantic address similarity; deduplication; fuzzy search |
| Cohere Embed v3 | Cohere | High-quality English address embeddings for OpenSearch k-NN |
| Meta Llama 3.1 8B | Meta | Open-weight NER; self-hosted control requirements |

### 2.2 Address Verification Use Cases — Bedrock Strengths

| Use Case | Model | Rationale |
|---|---|---|
| **Freeform address parsing** | Claude 3.5 Haiku | Parse "123 n main st apt 4b springfield il 62701" → structured JSON with zero training data |
| **Intelligent correction suggestions** | Claude 3 Sonnet | When USPS API returns no match, Claude reasons about probable correct form |
| **Multi-language / international addresses** | Claude 3 Sonnet | Handles Mexican colonias, Puerto Rico addresses, military APO/FPO, US territories |
| **Address anomaly explanation** | Claude 3 Haiku | Human-readable explanation of why an address failed validation |
| **Semantic address deduplication** | Titan Embeddings V2 | Embed address strings → cosine similarity → k-NN in OpenSearch |
| **Batch intelligent correction (via Bedrock Batch)** | Claude 3 Haiku | Async batch API processes Databricks-exported addresses overnight |
| **RAG address knowledge base** | Titan Embeddings + KB | Store USPS city/ZIP reference data; answer "is 62701 a valid Springfield IL ZIP?" |
| **Audit log narrative summaries** | Claude 3 Haiku | Generate plain-English weekly report from OpenSearch aggregations |

### 2.3 Bedrock Limitations for Address Verification

| Limitation | Impact | Mitigation |
|---|---|---|
| Latency: 200–800 ms per call | Not suitable as the **primary** validation path for interactive use | Use as fallback only (USPS API → Bedrock if no match) |
| Per-token cost | Expensive at millions of calls/day | Cache aggressively in Redis; use Haiku over Sonnet where possible |
| GovCloud model availability | Some models unavailable in `us-gov-west-1` | Use us-gov-east-1 or commercial partition endpoints with PrivateLink |
| Non-deterministic output | Parsing results may vary run-to-run | Prompt engineering + structured output (JSON mode); validate schema |
| No CASS/DPV certification | Cannot replace USPS API for official deliverability confirmation | Use Bedrock only when USPS API is unavailable or returns no match |
| Context-window input limit | Very large batch inputs need chunking | Split bulk inputs into ≤50 addresses per Bedrock call |

---

## 3. Amazon SageMaker — Evaluation

### 3.1 What It Is

Amazon SageMaker is a fully managed ML platform covering the complete lifecycle: data preparation, model training, hyperparameter tuning, model registry, real-time and batch inference endpoints.

**Relevant SageMaker components:**

| Component | Address Verification Role |
|---|---|
| SageMaker JumpStart | Pre-built HuggingFace NER models (token classification), deployable in one click |
| SageMaker Training Jobs | Fine-tune NER model on USPS CASS address corpus |
| Real-time Endpoint | Sub-10ms NER inference; high-throughput validation |
| Serverless Inference | Pay-per-call endpoint; ideal for variable load |
| Batch Transform | Process millions of Databricks records overnight; no persistent endpoint cost |
| Feature Store | Store and serve address feature vectors (embeddings, completeness scores) |
| Pipelines | Automate retrain → validate → register → deploy on new labeled data |
| Model Registry | Version control for NER and scoring models |
| SageMaker Canvas | No-code model building for address completeness classifiers |

### 3.2 Address Verification Use Cases — SageMaker Strengths

| Use Case | Approach | Rationale |
|---|---|---|
| **Real-time NER address parsing** | HuggingFace `dslim/bert-base-NER` fine-tuned on USPS data; real-time endpoint | <10ms latency; 1000+ req/s; deterministic output |
| **Address completeness scoring** | XGBoost classifier on field-presence features; serverless endpoint | Replaces heuristic confidence scoring with learned model |
| **High-volume batch correction** | Batch Transform over Databricks-exported S3 parquet | 1M addresses/hr; cost-efficient; no persistent endpoint |
| **Duplicate address detection** | Sentence-BERT embeddings + FAISS approximate k-NN | Cluster near-duplicate addresses across Databricks tables |
| **Deliverability prediction** | LightGBM trained on DPV match codes + vacancy flags | Predict deliverability without USPS API call for cached addresses |
| **Carrier route assignment** | Trained classifier on ZIP + street parity | Supplement USPS API output when API is unavailable |
| **Continuous model improvement** | SageMaker Pipelines + Ground Truth labeling | Human-in-the-loop correction loop feeds new training data |
| **Anomaly detection on Databricks data** | Isolation Forest / Autoencoders | Flag statistically unusual addresses before batch processing |

### 3.3 SageMaker Limitations for Address Verification

| Limitation | Impact | Mitigation |
|---|---|---|
| Requires labeled training data | Cannot deploy NER without 10k+ labeled address pairs | Start with JumpStart pre-trained NER; fine-tune incrementally |
| Higher setup complexity | Weeks to first trained model | Use JumpStart + SageMaker Canvas for rapid prototyping |
| Persistent endpoint cost | Real-time endpoint ~$0.25/hr even at zero traffic | Use Serverless Inference or scale-to-zero with Application Auto Scaling |
| Not a "plug and play" API | Requires MLOps discipline | Establish model registry and pipeline governance early |
| Batch Transform latency | Hours for full Databricks dataset | Schedule nightly; not suitable for interactive requests |

---

## 4. Decision Matrix — Which Service for Which Purpose

```
ADDRESS VERIFICATION TASK                    BEDROCK    SAGEMAKER   USPS API   RATIONALE
─────────────────────────────────────────────────────────────────────────────────────────
Freeform NLP address parsing                  ●●●         ●●○          ○         Claude zero-shot beats custom NER for messy free text
Structured address field validation           ○           ●●●          ●●●       Rule-based + USPS API; no ML needed
USPS CASS/DPV deliverability check            ○           ○            ●●●       Only USPS API is authoritative
High-volume batch parsing (>100k/day)         ●●○         ●●●          ●○        SageMaker Batch Transform is cheapest at scale
Real-time interactive validation (<100ms)     ○           ●●●          ●●●       SageMaker endpoint or USPS API; Bedrock too slow
Correction suggestions when USPS fails        ●●●         ●○           ○         Claude's reasoning uniquely suited here
Multi-language / territory addresses          ●●●         ●○           ●○        Claude handles PR, VI, GU, APO/FPO natively
Address semantic deduplication                ●●●         ●●●          ○         Titan/Cohere embeddings + OpenSearch k-NN
Confidence scoring (ML-learned)               ○           ●●●          ○         XGBoost on field features
Anomaly detection on Databricks data          ○           ●●●          ○         Isolation Forest trained on historical patterns
Audit report generation (narrative)           ●●●         ○            ○         Claude summarizes OpenSearch/Databricks aggregates
Continuous learning from corrections          ○           ●●●          ○         SageMaker Pipelines + Ground Truth

● = Strong fit    ○ = Weak/not applicable
```

### Verdict

> **Use Amazon Bedrock** for tasks requiring **language understanding, reasoning, and zero-shot flexibility** — freeform parsing, correction suggestions, narrative generation, multi-language support.
>
> **Use Amazon SageMaker** for tasks requiring **speed, throughput, or custom domain expertise** — real-time NER, batch correction at scale, deliverability prediction, anomaly detection, continuous learning.
>
> **Do not use either** for authoritative USPS deliverability checking — only the USPS API (or CASS-certified vendors) provides legally reliable DPV results.

---

## 5. Full Platform Architecture

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║          ADDRESS VERIFICATION PLATFORM — AWS GovCloud (us-gov-west-1)               ║
╚══════════════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                                                 │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  S3 + CloudFront (Static Site)                                              │   │
│  │  ┌──────────────────────┐    ┌────────────────────────────────────────┐    │   │
│  │  │  index.html           │    │  verify.html                           │    │   │
│  │  │  Address Analyzer     │    │  User Tab: Single Address Verification │    │   │
│  │  │  (CSV/Excel matching) │    │  Admin Tab:                            │    │   │
│  │  │                       │    │   • API Config                         │    │   │
│  │  │                       │    │   • Bulk Verify                        │    │   │
│  │  │                       │    │   • Bedrock Parse (freeform NLP)       │    │   │
│  │  │                       │    │   • Databricks Browse / Export         │    │   │
│  │  │                       │    │   • OpenSearch Audit Log               │    │   │
│  │  │                       │    │   • Service Status Dashboard           │    │   │
│  │  └──────────────────────┘    └────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │ HTTPS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  API LAYER                                                                          │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐      │
│  │  API Gateway (REST) — WAF protected, API key auth, throttling/quotas     │      │
│  │                                                                           │      │
│  │  POST /verify  — Real-time address verification                           │      │
│  │  POST /parse   — Bedrock NLP freeform address parsing                    │      │
│  │  GET  /health  — Service health (Redis + OpenSearch + Databricks + ML)   │      │
│  │  GET  /audit   — Audit log query (OpenSearch)                             │      │
│  │  GET  /search  — Full-text address search (OpenSearch k-NN)              │      │
│  │  GET  /stats   — Aggregated statistics (Databricks SQL)                  │      │
│  │  GET  /browse  — Browse/filter Databricks records                        │      │
│  │  POST /batch   — Trigger SageMaker Batch Transform job                   │      │
│  └──────────────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  COMPUTE LAYER (VPC — Private Subnets)                                              │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐      │
│  │  AWS Lambda  (Node.js 20, VPC-enabled, 512MB–1GB, timeout 30s)           │      │
│  │                                                                           │      │
│  │  Verification Pipeline (per request):                                    │      │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │      │
│  │  │ 1. Rate-limit check ──────────────────────────▶ Redis           │    │      │
│  │  │ 2. Cache lookup ─────────────────────────────▶ Redis            │    │      │
│  │  │    ↓ cache miss                                                  │    │      │
│  │  │ 3. Structured input? ─YES──▶ USPS API (OAuth2)                 │    │      │
│  │  │    ↓ unstructured or USPS fails                                  │    │      │
│  │  │ 4a. NER parsing ────────────────────────────▶ SageMaker Endpoint│    │      │
│  │  │ 4b. Freeform fallback ──────────────────────▶ Bedrock Claude    │    │      │
│  │  │ 5. Confidence scoring ──────────────────────▶ SageMaker Endpoint│    │      │
│  │  │ 6. Write Redis cache (TTL 24h)               ▶ Redis            │    │      │
│  │  │ 7. Index audit record ──────────────────────▶ OpenSearch        │    │      │
│  │  │ 8. Persist result ──────────────────────────▶ Databricks SQL    │    │      │
│  │  └─────────────────────────────────────────────────────────────────┘    │      │
│  └──────────────────────────────────────────────────────────────────────────┘      │
│                             │                                                       │
│          ┌──────────────────┼──────────────────┐                                   │
│          ▼                  ▼                  ▼                                    │
│   ┌─────────────┐   ┌─────────────┐   ┌───────────────────────────────────┐       │
│   │  ElastiCache│   │  OpenSearch │   │  NAT Gateway → Internet           │       │
│   │  Redis 7    │   │  Service    │   │  (USPS API, Databricks, Bedrock,  │       │
│   │             │   │             │   │   SageMaker)                       │       │
│   │ • Addr cache│   │ • Audit idx │   └───────────────────────────────────┘       │
│   │ • Rate limit│   │ • Search idx│                                                │
│   │ • Sessions  │   │ • k-NN emb  │                                                │
│   │ • TTL 24h   │   │   (Titan)   │                                                │
│   └─────────────┘   └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ML LAYER                                                                           │
│                                                                                     │
│  ┌───────────────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  AMAZON BEDROCK                   │  │  AMAZON SAGEMAKER                    │  │
│  │                                   │  │                                      │  │
│  │  Claude 3.5 Haiku                 │  │  Real-time Endpoint (NER)            │  │
│  │  ├─ Freeform address parsing      │  │  ├─ HuggingFace bert-base-NER        │  │
│  │  ├─ Correction suggestions        │  │  │   fine-tuned on USPS CASS data    │  │
│  │  └─ Anomaly explanations          │  │  └─ <10ms, 1000+ req/s              │  │
│  │                                   │  │                                      │  │
│  │  Claude 3 Sonnet                  │  │  Serverless Endpoint (Scoring)       │  │
│  │  ├─ Multi-language parsing        │  │  ├─ XGBoost confidence scorer        │  │
│  │  ├─ APO/FPO/DPO military addrs   │  │  └─ Field-feature completeness model │  │
│  │  └─ Audit narrative reports       │  │                                      │  │
│  │                                   │  │  Batch Transform                     │  │
│  │  Amazon Titan Embeddings V2       │  │  ├─ Nightly Databricks batch job     │  │
│  │  ├─ Address semantic similarity   │  │  ├─ S3 ←→ Databricks via Spark      │  │
│  │  └─ OpenSearch k-NN indexing      │  │  └─ 1M addresses/hr                 │  │
│  │                                   │  │                                      │  │
│  │  Bedrock Batch Inference          │  │  SageMaker Pipelines                 │  │
│  │  └─ Overnight correction of       │  │  ├─ Automated retrain on new labels  │  │
│  │     historical Databricks records │  │  ├─ Model registry + versioning      │  │
│  └───────────────────────────────────┘  │  └─ A/B traffic splitting           │  │
│                                         └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                                         │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐      │
│  │  DATABRICKS (Delta Lake) — Primary Data Warehouse                        │      │
│  │                                                                           │      │
│  │  addresses.raw.input_records      — Raw user-submitted addresses         │      │
│  │  addresses.verified.results       — Verified records (USPS + ML result)  │      │
│  │  addresses.ml.training_data       — Human-labeled correction pairs       │      │
│  │  addresses.ml.embeddings          — Titan-generated address embeddings   │      │
│  │  addresses.analytics.daily_stats  — Aggregated verification metrics      │      │
│  │                                                                           │      │
│  │  Accessed via: Databricks SQL Statement Execution API v2.0               │      │
│  │  Authentication: Bearer token in AWS Secrets Manager                     │      │
│  │  Warehouse: SQL Serverless (auto-scales to zero)                         │      │
│  └──────────────────────────────────────────────────────────────────────────┘      │
│                                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐      │
│  │  ElastiCache Redis 7 │  │  OpenSearch 2.x       │  │  S3 (ML staging)    │      │
│  │  • Verified addr TTL │  │  • Audit log index    │  │  • Batch input CSV  │      │
│  │  • Rate-limit cntrs  │  │  • Full-text search   │  │  • Transform output │      │
│  │  • Session tokens    │  │  • k-NN embeddings    │  │  • Model artifacts  │      │
│  │  TLS + AUTH token    │  │  VPC + encryption     │  │  • Training data    │      │
│  └──────────────────────┘  └──────────────────────┘  └─────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                                                  │
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐         │
│  │  USPS APIs (apis.usps.com)                                            │         │
│  │  • /oauth2/v3/token — Client credentials OAuth2                       │         │
│  │  • /addresses/v3/address — CASS/DPV address standardization          │         │
│  │  Authoritative source for: deliverability, ZIP+4, carrier route, DPV │         │
│  └───────────────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SECURITY & GOVERNANCE LAYER (cross-cutting)                                        │
│                                                                                     │
│  AWS WAF         — SQL injection, XSS, rate-limit rules on API Gateway             │
│  AWS KMS         — CMK encryption for S3, Secrets Manager, ElastiCache, OpenSearch │
│  Secrets Manager — USPS credentials, Databricks token, Redis auth, OpenSearch pwd  │
│  IAM             — Least-privilege roles per Lambda function                        │
│  VPC             — All data-plane services in private subnets; no public endpoints  │
│  CloudTrail      — All API calls logged (FedRAMP AU-2 requirement)                 │
│  Config Rules    — Drift detection for encryption, public access blocks            │
│  GitHub Actions  — OIDC auth to GovCloud; no long-lived secrets in CI/CD          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Request Flow — Detailed Sequence

### 6.1 Real-time Interactive Verification (User submits single address)

```
Browser → API Gateway → Lambda
   │
   ├─ 1. Rate limit check ──────────────────────────────────────▶ Redis
   │      └─ If over limit: 429 Too Many Requests
   │
   ├─ 2. Address normalization (local USPS rules)
   │
   ├─ 3. Cache lookup (SHA-256 of normalized address) ──────────▶ Redis
   │      └─ HIT: Return cached result (<1ms)
   │
   ├─ 4. USPS API call (OAuth2 bearer token) ──────────────────▶ apis.usps.com
   │      ├─ SUCCESS: structured result → step 7
   │      └─ NO MATCH / AMBIGUOUS:
   │           ├─ 4a. Structured input → SageMaker NER endpoint (<10ms)
   │           └─ 4b. Freeform/messy → Bedrock Claude 3.5 Haiku (~300ms)
   │
   ├─ 5. Confidence scoring ───────────────────────────────────▶ SageMaker serverless
   │
   ├─ 6. Generate Titan embedding for k-NN ────────────────────▶ Bedrock Titan
   │
   ├─ 7. Write to Redis cache (TTL 24h) ───────────────────────▶ Redis
   │
   ├─ 8. Index in OpenSearch (audit + k-NN vector) ────────────▶ OpenSearch
   │
   └─ 9. Persist in Databricks Delta table ────────────────────▶ Databricks SQL API
          └─ Return result to browser with confidence score,
             USPS standardized form, deliverability, source
```

### 6.2 Nightly Batch Correction (Databricks → SageMaker → Databricks)

```
EventBridge Scheduler (02:00 UTC)
   │
   ├─ Lambda: Export unverified Databricks records → S3 (Parquet)
   │          SELECT * FROM addresses.raw.input_records
   │                  WHERE status IS NULL OR status = 'pending'
   │
   ├─ SageMaker Batch Transform
   │   Input:  s3://bucket/batch-input/YYYY-MM-DD/
   │   Model:  NER + confidence scorer (versioned in Model Registry)
   │   Output: s3://bucket/batch-output/YYYY-MM-DD/
   │
   ├─ Lambda: Load results from S3 → Databricks MERGE INTO
   │          MERGE INTO addresses.verified.results
   │          USING batch_results ON id = batch_results.id
   │          WHEN MATCHED THEN UPDATE ...
   │
   └─ Lambda: Reindex new records in OpenSearch
```

### 6.3 Bedrock Overnight Correction (Historical hard cases)

```
EventBridge Scheduler (03:00 UTC)
   │
   ├─ Lambda: Export low-confidence records from Databricks → S3
   │          SELECT * FROM addresses.verified.results
   │          WHERE confidence < 70 AND bedrock_attempted = FALSE
   │
   ├─ Bedrock Batch Inference (Claude 3.5 Haiku)
   │   Prompt: "Parse and correct this address into USPS format: {address}"
   │   Output: JSON with corrected fields + explanation
   │
   └─ Lambda: Update Databricks with Bedrock suggestions
              (human review queue for confidence < 80)
```

---

## 7. Databricks Schema

```sql
-- Primary catalog: addresses
-- Schema: verified

CREATE TABLE addresses.verified.results (
  id                STRING       NOT NULL,   -- UUID
  input_street      STRING,
  input_city        STRING,
  input_state       STRING,
  input_zip         STRING,
  std_street        STRING,
  std_city          STRING,
  std_state         STRING,
  std_zip           STRING,
  std_zip4          STRING,
  status            STRING,                  -- verified | corrected | invalid | offline
  confidence        INT,
  dpv_match_code    STRING,                  -- Y | S | D | N
  dpv_vacancy       STRING,                  -- Y | N
  carrier_route     STRING,
  delivery_point    STRING,
  from_cache        BOOLEAN,
  source            STRING,                  -- usps | sagemaker | bedrock | offline
  bedrock_attempted BOOLEAN  DEFAULT FALSE,
  bedrock_suggestion STRING,
  verified_at       TIMESTAMP DEFAULT NOW(),
  request_ip        STRING,
  response_ms       INT,
  embedding         ARRAY<FLOAT>             -- Titan embedding for similarity search
)
USING DELTA
PARTITIONED BY (std_state, status)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.autoOptimize.optimizeWrite' = 'true'
);

-- Training data table (human-reviewed corrections)
CREATE TABLE addresses.ml.training_data (
  id              STRING  NOT NULL,
  raw_address     STRING,
  correct_street  STRING,
  correct_city    STRING,
  correct_state   STRING,
  correct_zip     STRING,
  label_source    STRING,   -- human | usps | bedrock
  labeled_by      STRING,
  labeled_at      TIMESTAMP
)
USING DELTA;

-- Daily aggregated metrics (materialized by nightly job)
CREATE TABLE addresses.analytics.daily_stats (
  stat_date       DATE NOT NULL,
  total           BIGINT,
  verified        BIGINT,
  corrected       BIGINT,
  invalid         BIGINT,
  cache_hits      BIGINT,
  avg_response_ms DOUBLE,
  bedrock_calls   BIGINT,
  sagemaker_calls BIGINT,
  usps_calls      BIGINT
)
USING DELTA;
```

---

## 8. SageMaker NER Model — Training Specification

### 8.1 Base Model
- **`dslim/bert-base-NER`** (HuggingFace Hub) — pre-trained on CoNLL-2003; token classification
- Fine-tune on USPS address corpus with custom labels:

```
Label Set:
  B-NUM    I-NUM    — Street number (123)
  B-PREDIR I-PREDIR — Pre-directional (N, NE)
  B-STR    I-STR    — Street name (MAIN)
  B-SUF    I-SUF    — Street suffix (ST, AVE)
  B-POSTDIR         — Post-directional (NW)
  B-SEC    I-SEC    — Secondary designator (APT, STE, UNIT)
  B-SECNUM I-SECNUM — Secondary number (4B)
  B-CITY   I-CITY   — City name
  B-STATE           — State abbreviation
  B-ZIP5            — 5-digit ZIP
  B-ZIP4            — ZIP+4 extension
  O                 — Outside / non-address
```

### 8.2 Training Data Pipeline
```
1. Export verified address pairs from Databricks
   (addresses.ml.training_data → USPS canonical form)
2. BIO tagging via spaCy rule-based pre-labeler
3. Human review via SageMaker Ground Truth labeling job
4. Fine-tune with SageMaker Training Job (ml.m5.xlarge × 1, ~2h)
5. Evaluate on held-out test set (F1 target: >0.92 per entity)
6. Register in SageMaker Model Registry
7. Deploy to Serverless Inference endpoint
8. Shadow-mode A/B test against previous version for 48h
```

---

## 9. Bedrock Prompt Templates

### 9.1 Freeform Address Parsing (Claude 3.5 Haiku)

```
System: You are a USPS address parsing assistant. 
Extract structured address fields from raw text. 
Respond ONLY with valid JSON. No explanation.

User: Parse this address into USPS standard fields:
"{raw_address}"

Required JSON schema:
{
  "streetNumber": string | null,
  "preDir": "N"|"S"|"E"|"W"|"NE"|"NW"|"SE"|"SW" | null,
  "streetName": string | null,
  "streetSuffix": "ST"|"AVE"|"RD"|"DR"|"BLVD"|"LN"|"CT"|... | null,
  "postDir": string | null,
  "secUnit": "APT"|"STE"|"UNIT"|"BLDG"|"FL"|"RM"| null,
  "secUnitNum": string | null,
  "city": string | null,
  "state": string | null,
  "zip5": string | null,
  "zip4": string | null,
  "addressType": "standard"|"po_box"|"rural_route"|"military"|"general_delivery",
  "confidence": 0-100,
  "issues": string[]
}
```

### 9.2 Correction Suggestion (Claude 3 Sonnet)

```
System: You are a USPS address correction assistant.
Given a structured address that failed USPS validation,
suggest the most likely correct USPS deliverable form.
Base suggestions on ZIP code range, city name spelling,
street suffix conventions, and known USPS patterns.

User: This address failed USPS validation:
Street: {street}
City:   {city}
State:  {state}
ZIP:    {zip}
Error:  {usps_error_code} — {usps_error_message}

Suggest up to 3 corrected alternatives ranked by confidence.
Return ONLY JSON matching this schema: [{"street":..., "city":..., 
"state":..., "zip":..., "confidence":0-100, "reason":"..."}]
```

---

## 10. Implementation Roadmap

| Phase | Milestone | Services | Timeline |
|---|---|---|---|
| **Phase 1** | USPS API + Redis + OpenSearch + Databricks (core pipeline) | Lambda, API GW, ElastiCache, OpenSearch, Databricks | Week 1–2 |
| **Phase 2** | Bedrock Claude freeform parsing + correction suggestions | Bedrock (Haiku, Sonnet) | Week 2–3 |
| **Phase 3** | Titan Embeddings → OpenSearch k-NN address search | Bedrock (Titan), OpenSearch | Week 3 |
| **Phase 4** | SageMaker NER endpoint (JumpStart → fine-tuned) | SageMaker JumpStart, Training, Serverless | Week 4–6 |
| **Phase 5** | SageMaker Batch Transform nightly Databricks job | SageMaker Batch, EventBridge, S3 | Week 6–7 |
| **Phase 6** | Bedrock Batch overnight correction of low-confidence records | Bedrock Batch Inference | Week 7–8 |
| **Phase 7** | SageMaker Pipelines automated retrain loop | SageMaker Pipelines, Ground Truth | Week 8–12 |
| **Phase 8** | Anomaly detection on Databricks data | SageMaker (Isolation Forest) | Week 10–12 |

---

## 11. Cost Model (Estimated Monthly — Production Scale)

| Service | Usage Assumption | Estimated Cost |
|---|---|---|
| **USPS API** | 100k verifications/month | Free (government) |
| **Bedrock Claude 3.5 Haiku** | 20k freeform parses @ ~500 tokens avg | ~$25/month |
| **Bedrock Titan Embeddings V2** | 100k embeddings @ 256 tokens | ~$10/month |
| **SageMaker Serverless NER** | 100k calls @ 10ms | ~$15/month |
| **SageMaker Batch Transform** | 2M records/month (nightly) | ~$20/month |
| **ElastiCache Redis (cache.t3.micro)** | Dev/staging | ~$15/month |
| **OpenSearch (t3.small.search × 1)** | Dev/staging | ~$30/month |
| **Databricks SQL Serverless** | 100 DBU/month | ~$40/month |
| **API Gateway + Lambda** | 100k req/month | ~$5/month |
| **NAT Gateway** | 10GB/month data | ~$35/month |
| **Total (dev/staging estimate)** | | **~$195/month** |

*Production scale (multi-AZ Redis, OpenSearch 3-node, larger SageMaker endpoint): ~$600–900/month*

---

## 12. GovCloud Considerations

| Requirement | Implementation |
|---|---|
| Bedrock in GovCloud | Available in `us-gov-west-1`; check model availability before finalizing model selection; Claude 3.5 Haiku generally available |
| SageMaker in GovCloud | Fully available; JumpStart models available via GovCloud endpoint |
| No data egress to commercial partition | All services in `us-gov-west-1`; Databricks workspace must be in GovCloud VPC or connected via PrivateLink |
| FedRAMP authorization | Bedrock, SageMaker, ElastiCache, OpenSearch, Lambda, API Gateway are all FedRAMP Moderate authorized |
| ITAR / CUI compliance | Enable KMS CMK encryption on all services; enable CloudTrail; use PrivateLink endpoints |
| GitHub Actions OIDC | Use OIDC federation to assume GovCloud IAM role; no long-lived access keys stored in GitHub secrets |
