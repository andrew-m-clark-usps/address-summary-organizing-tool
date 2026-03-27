# Infrastructure Decisions — Address Verification Platform

**Version:** 1.0  
**Date:** 2026-03-27  
**Status:** Approved  
**Scope:** AWS GovCloud (us-gov-west-1) — FedRAMP Moderate baseline

---

## 1. Purpose

This document records every significant infrastructure technology decision for the Address Verification Platform, the alternatives considered, and the rationale for each choice. It is an Architecture Decision Record (ADR) intended to remain current as the platform evolves.

---

## 2. Decision Summary Table

| Layer | Decision | Alternatives Considered | Decisive Factor |
|---|---|---|---|
| **Frontend hosting** | S3 + CloudFront | EC2/ECS static, Amplify | Zero server footprint; existing infrastructure |
| **API layer** | API Gateway REST API + WAF | HTTP API, App Load Balancer | WAF integration; usage plans; FedRAMP logging |
| **Compute** | Lambda (Node.js 20) | ECS Fargate, EC2, App Runner | Serverless; scales to zero; VPC-enabled |
| **Address validation (authoritative)** | USPS API v3 (OAuth2) | SmartyStreets, Lob, Melissa | Government mandate; free for USPS use |
| **Address NLP (freeform/fallback)** | Bedrock Claude 3.5 Haiku | SageMaker custom NER, Comprehend | Zero training data; handles edge cases instantly |
| **High-volume batch NLP** | SageMaker Batch Transform | Bedrock Batch, EMR, Glue | Cost efficiency at scale; deterministic output |
| **Real-time structured NER** | SageMaker Serverless Endpoint | Bedrock, Comprehend custom | <10ms latency; 10× cheaper than Bedrock per call |
| **Address embeddings** | Bedrock Titan Embeddings V2 | SageMaker embedding model, sentence-BERT | Native AWS; no model hosting needed; 1536-dim |
| **Caching** | ElastiCache Redis 7 | MemoryDB, DynamoDB DAX, local | Purpose-built cache; TTL/LRU; sorted-set rate limiting |
| **Search + audit log** | OpenSearch Service 2.x | DynamoDB, CloudSearch, Databricks | k-NN vector search; full-text; VPC endpoint |
| **Primary data warehouse** | Databricks (Delta Lake) | Redshift, S3+Athena, DynamoDB | Customer requirement; ACID; CDC for ML training |
| **Secrets** | Secrets Manager | Parameter Store, HashiCorp Vault | Auto-rotation; fine-grained IAM; FedRAMP SC-28 |
| **Encryption keys** | KMS CMK (per service) | AWS-managed keys | Customer-controlled key material; FedRAMP SC-28 |
| **CI/CD auth** | GitHub Actions OIDC | IAM access keys, CodePipeline | No long-lived credentials; FedRAMP AC-2/AC-17 |
| **Observability** | CloudWatch + X-Ray | Datadog, New Relic, Splunk | GovCloud native; no data egress; FedRAMP AU-2 |
| **Networking** | VPC + private subnets + NAT GW | Public subnets, PrivateLink only | Defense-in-depth; all data-plane services private |
| **DDoS / WAF** | AWS WAF v2 Managed Rules | Custom WAF rules, Shield Advanced | Immediate coverage; no custom rule maintenance |

---

## 3. Detailed Decisions

### 3.1 API Layer — REST API over HTTP API

**Decision:** API Gateway REST API (not HTTP API v2)

**Why:**
- WAF v2 can only be associated with REST APIs in GovCloud at this time
- REST API supports per-client **usage plans and API keys** needed for admin vs. user quota differentiation
- REST API has richer **CloudWatch execution logging** (request/response body, latency, status codes) — required for FedRAMP AU-2 (Audit Events)
- Stage-level throttling (10,000 RPS burst / 5,000 RPS steady) aligns with USPS rate limits

**Trade-off:** REST API costs $3.50/million calls vs $1.00 for HTTP API. At expected volume (<500k calls/month) the difference is <$2/month — negligible.

---

### 3.2 Compute — Lambda over ECS/Fargate

**Decision:** AWS Lambda (Node.js 20, 512 MB–1 GB, VPC-enabled)

**Why:**
- **Zero idle cost** — no charges when no addresses are being verified
- **VPC-enabled** — Lambda can reach ElastiCache (Redis) and OpenSearch in private subnets
- **Built-in concurrency controls** — reserved concurrency prevents runaway costs
- **X-Ray tracing** — native support; no sidecar needed; FedRAMP SI-4 compliant
- **Cold start:** Node.js 20 SnapStart is not yet in GovCloud; mitigation = provisioned concurrency for `prod` environment if p99 latency is a concern

**Trade-off:** Max 15-minute execution timeout. The batch `/batch` endpoint only *triggers* the SageMaker job; it does not process inline. All other routes complete in <5 seconds.

---

### 3.3 Address Validation — USPS API v3 (authoritative)

**Decision:** USPS API v3 (`apis.usps.com`) as the **primary** validation source

**Why:**
- Only USPS-certified DPV (Delivery Point Validation) produces legally authoritative deliverability results
- OAuth2 client credentials flow — tokens cached in Lambda context; no per-call auth latency
- Government-to-government: free of charge for USPS internal use; no third-party dependency
- Returns: standardized address, ZIP+4, carrier route, delivery point, DPV match code, vacancy flag

**Fallback chain when USPS returns no match or is unavailable:**
```
USPS API ──fail──▶ SageMaker NER (structured input, <10ms)
                         ──low confidence──▶ Bedrock Claude 3.5 Haiku (freeform, ~300ms)
                                                  ──all fail──▶ Offline local rules
```

---

### 3.4 AI/ML — Bedrock vs SageMaker (Hybrid)

**Decision:** Use **both**, tiered by use case. Neither replaces the other.

#### Use Bedrock for:
| Use Case | Model | Why Bedrock Wins |
|---|---|---|
| Freeform address parsing | Claude 3.5 Haiku | Zero training data; handles any format; edge cases (APO/FPO, territories) |
| Correction suggestions on USPS failure | Claude 3 Sonnet | Reasoning capability; "why did this fail?" |
| Multi-language / territory addresses | Claude 3 Sonnet | Puerto Rico, Guam, USVI, military — Sonnet handles natively |
| Audit narrative reports | Claude 3.5 Haiku | Generate weekly summaries from OpenSearch aggregations |
| Address embeddings (semantic search) | Titan Embeddings V2 | No model to host; 1536-dim; native OpenSearch k-NN integration |
| Overnight batch hard-case correction | Bedrock Batch API | Async; cost-efficient; Claude applies reasoning to historical low-confidence records |

#### Use SageMaker for:
| Use Case | Approach | Why SageMaker Wins |
|---|---|---|
| Real-time NER (structured input) | HuggingFace BERT fine-tuned; serverless endpoint | <10ms; 10× cheaper than Bedrock per call at scale |
| Confidence scoring | XGBoost on field-presence features; serverless | Deterministic; 1ms; learns from corrections |
| Nightly Databricks batch | Batch Transform over S3-exported Parquet | 1M addresses/hr; no persistent endpoint cost |
| Continuous learning pipeline | SageMaker Pipelines + Ground Truth | Human-in-the-loop; automatic retrain on new labeled data |

#### Why NOT Comprehend?
Amazon Comprehend Custom Entity Recognition was evaluated and **rejected**:
- Cannot produce the fine-grained BIO-tagged address component schema required (streetNumber, preDir, streetName, suffix, secUnit, etc.)
- No GPU acceleration for batch jobs → slower and more expensive than SageMaker at scale
- Cannot be integrated with SageMaker Pipelines for automated retraining

---

### 3.5 Caching — ElastiCache Redis over MemoryDB

**Decision:** ElastiCache Redis 7.x (1 primary + 1 replica, TLS, AUTH token)

**Why Redis, not MemoryDB:**
- MemoryDB is a durable database; ElastiCache is a cache — for address verification results with 24-hour TTL, durability is unnecessary
- ElastiCache is ~40% cheaper per node than MemoryDB for equivalent instance types
- Redis sorted sets provide the sliding-window rate-limiting primitive we need with atomic ZADD/ZCARD operations
- Redis SETEX handles TTL natively; simple to reason about for address cache expiry

**Why Redis, not DynamoDB DAX:**
- DAX only accelerates DynamoDB reads — our cache is independent of DynamoDB
- Redis is already used for rate limiting; a second cache layer adds complexity

**Why 1 replica in production:**
- Automatic failover enabled: if primary fails, replica promotes in <60 seconds
- GovCloud us-gov-west-1 has 2 AZs; 1 replica places primary and replica in different AZs
- Adding more replicas provides read scaling but address verification is not read-heavy (cache hit rate reduces USPS API calls, not Redis calls)

---

### 3.6 Search + Audit — OpenSearch Service over DynamoDB

**Decision:** OpenSearch Service 2.x (VPC, t3.medium.search × 2, k-NN enabled)

**Why OpenSearch, not DynamoDB:**
- DynamoDB has no full-text search and no vector/k-NN capability
- OpenSearch k-NN plugin is required for Titan Embeddings similarity search (find "addresses like this one")
- `fuzziness: AUTO` in OpenSearch handles common address typos in admin search panel
- OpenSearch aggregations produce audit log summaries natively (status counts, daily volumes)
- VPC endpoint keeps all audit traffic in the private network (FedRAMP AU-9)

**Why managed OpenSearch, not OpenSearch Serverless:**
- OpenSearch Serverless does not support k-NN in GovCloud at this time
- Serverless is more expensive for sustained workloads (OCU pricing vs instance pricing)
- Managed domain gives full control over index mappings (needed for knn_vector field type)

---

### 3.7 Data Warehouse — Databricks (Delta Lake)

**Decision:** Databricks on AWS GovCloud as the **primary data store** for verified address records

**Why Databricks, not Redshift or S3+Athena:**

| Factor | Databricks | Redshift | S3 + Athena |
|---|---|---|---|
| ACID transactions | ✅ Delta Lake | ✅ | ✗ |
| Change Data Feed (for ML training) | ✅ | ✗ | ✗ |
| Time travel / data versioning | ✅ | ✗ | ✗ |
| Streaming + batch in one platform | ✅ | Partial | ✗ |
| Native Spark for ML data prep | ✅ | ✗ | ✗ |
| Auto-optimize / Z-ORDER | ✅ | ✗ | ✗ |
| SQL Serverless (scales to zero) | ✅ | ✗ | ✅ |
| Unity Catalog (governance, lineage) | ✅ | ✗ | ✗ |
| Customer requirement | ✅ | ✗ | ✗ |

Delta Lake's Change Data Feed enables the SageMaker training pipeline to consume only *new* labeled corrections without full table scans.

---

### 3.8 Networking — Private Subnets + NAT Gateway

**Decision:** All data-plane services (Lambda, Redis, OpenSearch) in private subnets; NAT Gateway for outbound internet access (USPS API, Databricks, Bedrock)

**Why not PrivateLink for everything:**
- USPS API (`apis.usps.com`) is a public internet endpoint — NAT Gateway is required
- Databricks SQL REST API is also public internet — NAT Gateway required
- Bedrock is available via VPC endpoint in GovCloud — but to keep architecture simple and consistent, all outbound flows go through NAT
- PrivateLink VPC endpoints are added for Secrets Manager and S3 to avoid NAT costs on high-frequency secret lookups

**Single NAT Gateway in dev/staging; dual in prod:**
- Development: `single_nat_gateway = true` — saves ~$30/month per environment
- Production: `single_nat_gateway = false` — each AZ gets its own NAT GW; AZ failure does not break outbound connectivity

---

### 3.9 CI/CD Authentication — OIDC over IAM Access Keys

**Decision:** GitHub Actions OIDC federation → GovCloud IAM role assumption

**Why:**
- **No long-lived credentials** stored in GitHub Secrets — eliminates the most common credential leak vector
- FedRAMP control **AC-2 (Account Management)** and **AC-17 (Remote Access)** require that access credentials be tied to identities and rotated; OIDC tokens expire after each workflow run
- GitHub's OIDC provider is configured to trust `token.actions.githubusercontent.com`
- The IAM role uses a **condition on the subject claim** (`repo:org/repo:ref:refs/heads/main`) to prevent any other repository or branch from assuming the role
- Required GitHub Actions permissions: `id-token: write`, `contents: read`

---

### 3.10 Observability — CloudWatch + X-Ray

**Decision:** AWS CloudWatch (logs + metrics + dashboards + alarms) + AWS X-Ray (distributed tracing)

**Why not third-party APM (Datadog, New Relic, Splunk):**
- All third-party APM agents send data to commercial cloud endpoints — **prohibited for GovCloud FedRAMP** workloads unless the APM vendor holds their own FedRAMP authorization for the GovCloud partition
- CloudWatch and X-Ray are FedRAMP Moderate authorized in `us-gov-west-1`
- X-Ray traces show the full Lambda execution path: Redis hit/miss → USPS API call → Bedrock invoke → OpenSearch index → Databricks write — all in a single service map

---

## 4. Final Architecture — AWS GovCloud

```
╔═════════════════════════════════════════════════════════════════════════════╗
║         ADDRESS VERIFICATION PLATFORM — FINAL ARCHITECTURE                  ║
║         AWS GovCloud  us-gov-west-1  |  FedRAMP Moderate                   ║
╚═════════════════════════════════════════════════════════════════════════════╝

 INTERNET / GITHUB
        │
        │  HTTPS
        ▼
┌───────────────────────────────────────────────────────────────┐
│  EDGE LAYER                                                   │
│                                                               │
│  CloudFront ──── S3 (static site)                            │
│    verify.html, index.html, js/, css/                        │
│    HTTPS only · AES-256 at rest · OAC                        │
│                                                               │
│  AWS WAF v2 (on API Gateway)                                  │
│    ├── AWSManagedRulesCommonRuleSet                           │
│    ├── AWSManagedRulesKnownBadInputsRuleSet                   │
│    └── AWSManagedRulesSQLiRuleSet                            │
└───────────────────────────────────────────────────────────────┘
        │
        │  HTTPS  (x-api-key header)
        ▼
┌───────────────────────────────────────────────────────────────┐
│  API GATEWAY  (REST, Stage: prod / staging)                   │
│                                                               │
│  POST /verify   POST /parse    GET  /health                   │
│  GET  /audit    GET  /search   GET  /stats                    │
│  GET  /browse   POST /batch                                   │
│                                                               │
│  Usage Plan: 10k RPS burst · 5k RPS steady                   │
│  CloudWatch execution logs (INFO) · X-Ray active tracing      │
└───────────────────────────────────────────────────────────────┘
        │
        │  Lambda proxy+
        ▼
╔═══════════════════════════════════════════════════════════════╗
║  VPC  10.0.0.0/16                                            ║
║                                                               ║
║  ┌─ Public Subnet AZ-1 ─┐  ┌─ Public Subnet AZ-2 ─┐        ║
║  │  NAT GW-1            │  │  NAT GW-2            │        ║
║  └──────────────────────┘  └──────────────────────┘        ║
║            │                         │                       ║
║  ┌─ Private Subnet AZ-1 ─────────────────────────────────┐  ║
║  │                                                        │  ║
║  │  ┌────────────────────────────────────────────────┐   │  ║
║  │  │  Lambda  (Node.js 20, 512MB, timeout 30s)      │   │  ║
║  │  │  VPC SG: egress-all                            │   │  ║
║  │  │                                                │   │  ║
║  │  │  index.mjs ─┬─ cache.mjs   (Redis)            │   │  ║
║  │  │             ├─ search.mjs  (OpenSearch)        │   │  ║
║  │  │             ├─ databricks.mjs (SQL API → NAT)  │   │  ║
║  │  │             ├─ usps.mjs    (USPS API → NAT)    │   │  ║
║  │  │             ├─ bedrock.mjs (Bedrock → NAT)     │   │  ║
║  │  │             └─ sagemaker.mjs (SM endpoint)     │   │  ║
║  │  └────────────────────────────────────────────────┘   │  ║
║  │              │             │                           │  ║
║  │  ┌───────────┴──┐  ┌───────┴────────┐                 │  ║
║  │  │ ElastiCache  │  │ OpenSearch     │                 │  ║
║  │  │ Redis 7.1    │  │ Service 2.x    │                 │  ║
║  │  │              │  │                │                 │  ║
║  │  │ cache.t3.med │  │ t3.medium.srch │                 │  ║
║  │  │ 1P + 1R      │  │ 2-node, k-NN  │                 │  ║
║  │  │ TLS + AUTH   │  │ VPC + FGAC    │                 │  ║
║  │  └──────────────┘  └────────────────┘                 │  ║
║  └────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════╝
        │  (via NAT Gateway)
        ▼
┌───────────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES  (HTTPS, AWS-signed where applicable)      │
│                                                               │
│  USPS API (apis.usps.com)                                    │
│  ├── /oauth2/v3/token    — Client credentials OAuth2          │
│  └── /addresses/v3/address — CASS/DPV validation             │
│                                                               │
│  Amazon Bedrock  (bedrock-runtime.us-gov-west-1.amazonaws.com)│
│  ├── Claude 3.5 Haiku   — Freeform parsing, suggestions      │
│  ├── Claude 3 Sonnet    — Complex/multi-language addresses    │
│  └── Titan Embeddings V2 — 1536-dim address vectors          │
│                                                               │
│  Amazon SageMaker  (runtime.sagemaker.us-gov-west-1...)      │
│  ├── NER Endpoint    — BERT fine-tuned on USPS CASS data     │
│  └── Scoring Endpoint — XGBoost confidence scorer            │
│                                                               │
│  Databricks  (workspace.azuredatabricks.net or GovCloud VPC) │
│  └── SQL Statement Execution API v2.0                        │
│      addresses.verified.results  (Delta, partitioned)        │
│      addresses.ml.training_data  (Delta, CDC enabled)        │
│      addresses.analytics.daily_stats                         │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  SECURITY & GOVERNANCE                                        │
│                                                               │
│  AWS Secrets Manager                                          │
│  ├── usps-api          { consumer_key, consumer_secret }      │
│  ├── databricks        { host, token, warehouse_id }          │
│  ├── redis-auth        { auth_token }                         │
│  └── opensearch-master { username, password }                 │
│                                                               │
│  AWS KMS (CMK)  — ElastiCache, OpenSearch, S3, Secrets Mgr   │
│  AWS CloudTrail — All API calls (FedRAMP AU-2)               │
│  AWS Config     — Compliance rules (encryption, public-access)│
│  CloudWatch + X-Ray — Logs, metrics, distributed traces       │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  CI/CD  (GitHub Actions)                                      │
│                                                               │
│  Push to main     → deploy static site to S3 + CF + Lambda   │
│  Push to develop  → deploy to staging                         │
│  Auth:  OIDC federation (no long-lived keys in GitHub)        │
│  Jobs:  deploy-site, deploy-lambda, invalidate-cache          │
│                                                               │
│  Nightly (EventBridge 02:00 UTC):                             │
│    Lambda → export Databricks → S3 → SageMaker Batch         │
│           → load results → Databricks MERGE INTO             │
│           → reindex OpenSearch                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 5. FedRAMP Control Mapping

| Control | Implementation |
|---|---|
| **AC-2** Account Management | OIDC for GitHub Actions; no shared accounts; Secrets Manager per-secret IAM |
| **AC-3** Access Enforcement | IAM least-privilege roles; Lambda role has only required service permissions |
| **AC-17** Remote Access | OIDC-based access only; MFA enforced at AWS account level |
| **AU-2** Audit Events | CloudTrail + API Gateway execution logs + Lambda CloudWatch logs |
| **AU-9** Protection of Audit Info | OpenSearch audit index accessible only to Lambda IAM role via domain policy |
| **SC-8** Transmission Confidentiality | TLS 1.2+ everywhere; HTTPS-only on API Gateway; TLS on Redis |
| **SC-28** Protection at Rest | KMS CMK on ElastiCache, OpenSearch, Secrets Manager, S3 |
| **SI-3** Malicious Code Protection | WAF Managed Rules (CommonRuleSet + SQLi + KnownBadInputs) |
| **SI-4** System Monitoring | X-Ray distributed traces; CloudWatch alarms on error rate, latency |
| **IA-5** Authenticator Management | Secrets Manager auto-rotation for Redis auth token; USPS token cached in-memory (short TTL) |

---

## 6. Instance / Tier Sizing

| Service | Dev / Staging | Production |
|---|---|---|
| Lambda | 512 MB, 1 concurrency reserved | 1 GB, 50 concurrency reserved |
| ElastiCache Redis | `cache.t3.micro`, 0 replicas | `cache.r7g.large`, 1 replica |
| OpenSearch | `t3.small.search` × 1 | `r6g.large.search` × 2 (multi-AZ) |
| NAT Gateway | 1 (single AZ) | 2 (one per AZ) |
| SageMaker NER | Not deployed | Serverless Inference (0.5 GB) |
| SageMaker Scoring | Not deployed | Serverless Inference (0.5 GB) |

---

## 7. Terraform Module Map

```
infrastructure/terraform/
├── provider.tf         — AWS provider (GovCloud), Databricks provider
├── variables.tf        — All input variables
├── outputs.tf          — All output values
├── main.tf             — S3 + CloudFront (static site)
├── vpc.tf              — VPC, subnets, NAT GW, security groups
├── secrets.tf          — Secrets Manager (USPS, Databricks, Redis, OpenSearch)
├── cache.tf            — ElastiCache Redis
├── search.tf           — OpenSearch Service domain
├── api.tf              — Lambda function, IAM role, API Gateway REST API, WAF
├── ml.tf               — Bedrock IAM policies, SageMaker endpoints, EventBridge batch scheduler
└── databricks.tf       — Databricks provider, Delta tables, SQL warehouse
```
