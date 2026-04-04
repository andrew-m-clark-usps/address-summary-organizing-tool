# ============================================================
# databricks.tf — Databricks provider + Delta Lake tables
#
# Provisions:
#   1. Databricks provider (authenticated via Secrets Manager token)
#   2. Unity Catalog: catalog + schemas
#   3. Delta tables: verified.results, ml.training_data,
#                    analytics.daily_stats
#   4. SQL Serverless warehouse (auto-scales to zero)
#
# Prerequisites:
#   - Databricks workspace already created in GovCloud environment
#   - var.databricks_host and var.databricks_token must be set
# ============================================================

terraform {
  required_providers {
    databricks = {
      source  = "databricks/databricks"
      version = "~> 1.40"
    }
  }
}

provider "databricks" {
  host  = var.databricks_host
  token = var.databricks_token
}

# ── SQL Serverless Warehouse ──────────────────────────────────
resource "databricks_sql_endpoint" "verify" {
  name             = "${var.project_name}-${var.environment}"
  cluster_size     = "2X-Small"        # 2 DBU/hr; scales to zero in 5 min
  min_num_clusters = 0
  max_num_clusters = 3
  auto_stop_mins   = 5
  enable_serverless_compute = true

  tags {
    custom_tags {
      key   = "Environment"
      value = var.environment
    }
  }
}

# ── Unity Catalog ─────────────────────────────────────────────
resource "databricks_catalog" "addresses" {
  name    = var.databricks_catalog
  comment = "Address Verification Platform — ${var.environment}"
}

resource "databricks_schema" "verified" {
  catalog_name = databricks_catalog.addresses.name
  name         = "verified"
  comment      = "USPS-verified address records"
}

resource "databricks_schema" "ml" {
  catalog_name = databricks_catalog.addresses.name
  name         = "ml"
  comment      = "ML training data and embeddings"
}

resource "databricks_schema" "analytics" {
  catalog_name = databricks_catalog.addresses.name
  name         = "analytics"
  comment      = "Aggregated daily metrics"
}

# ── Delta Table: verified.results ────────────────────────────
resource "databricks_sql_table" "results" {
  catalog_name       = databricks_catalog.addresses.name
  schema_name        = databricks_schema.verified.name
  name               = "results"
  table_type         = "MANAGED"
  data_source_format = "DELTA"
  comment            = "Verified address records — one row per verification request"

  properties = {
    "delta.enableChangeDataFeed"            = "true"
    "delta.autoOptimize.optimizeWrite"      = "true"
    "delta.autoOptimize.autoCompact"        = "true"
  }

  column {
    name    = "id"
    type    = "STRING"
    comment = "UUID primary key"
    nullable = false
  }
  column { name = "input_street";    type = "STRING";    nullable = true  }
  column { name = "input_city";      type = "STRING";    nullable = true  }
  column { name = "input_state";     type = "STRING";    nullable = true  }
  column { name = "input_zip";       type = "STRING";    nullable = true  }
  column { name = "std_street";      type = "STRING";    nullable = true  }
  column { name = "std_city";        type = "STRING";    nullable = true  }
  column { name = "std_state";       type = "STRING";    nullable = true  }
  column { name = "std_zip";         type = "STRING";    nullable = true  }
  column { name = "std_zip4";        type = "STRING";    nullable = true  }
  column {
    name    = "status"
    type    = "STRING"
    comment = "verified | corrected | invalid | offline"
    nullable = true
  }
  column { name = "confidence";      type = "INT";       nullable = true  }
  column { name = "dpv_match_code";  type = "STRING";    nullable = true  }
  column { name = "dpv_vacancy";     type = "STRING";    nullable = true  }
  column { name = "carrier_route";   type = "STRING";    nullable = true  }
  column { name = "delivery_point";  type = "STRING";    nullable = true  }
  column { name = "from_cache";      type = "BOOLEAN";   nullable = true  }
  column {
    name    = "source"
    type    = "STRING"
    comment = "usps | sagemaker-ner | bedrock | offline"
    nullable = true
  }
  column { name = "bedrock_attempted"; type = "BOOLEAN"; nullable = true  }
  column { name = "bedrock_suggestion"; type = "STRING"; nullable = true  }
  column { name = "verified_at";     type = "TIMESTAMP"; nullable = true  }
  column { name = "request_ip";      type = "STRING";    nullable = true  }
  column { name = "response_ms";     type = "INT";       nullable = true  }
  column {
    name    = "embedding"
    type    = "ARRAY<FLOAT>"
    comment = "Titan Embeddings V2 vector (1536 dims) for similarity search"
    nullable = true
  }

  depends_on = [databricks_schema.verified]
}

# ── Delta Table: ml.training_data ────────────────────────────
resource "databricks_sql_table" "training_data" {
  catalog_name       = databricks_catalog.addresses.name
  schema_name        = databricks_schema.ml.name
  name               = "training_data"
  table_type         = "MANAGED"
  data_source_format = "DELTA"
  comment            = "Human-reviewed correction pairs for NER model retraining"

  column { name = "id";             type = "STRING";    nullable = false }
  column { name = "raw_address";    type = "STRING";    nullable = true  }
  column { name = "correct_street"; type = "STRING";    nullable = true  }
  column { name = "correct_city";   type = "STRING";    nullable = true  }
  column { name = "correct_state";  type = "STRING";    nullable = true  }
  column { name = "correct_zip";    type = "STRING";    nullable = true  }
  column {
    name    = "label_source"
    type    = "STRING"
    comment = "human | usps | bedrock"
    nullable = true
  }
  column { name = "labeled_by";  type = "STRING";    nullable = true  }
  column { name = "labeled_at";  type = "TIMESTAMP"; nullable = true  }

  depends_on = [databricks_schema.ml]
}

# ── Delta Table: analytics.daily_stats ───────────────────────
resource "databricks_sql_table" "daily_stats" {
  catalog_name       = databricks_catalog.addresses.name
  schema_name        = databricks_schema.analytics.name
  name               = "daily_stats"
  table_type         = "MANAGED"
  data_source_format = "DELTA"
  comment            = "Nightly aggregated verification metrics (populated by batch job)"

  column { name = "stat_date";       type = "DATE";    nullable = false }
  column { name = "total";           type = "BIGINT";  nullable = true  }
  column { name = "verified";        type = "BIGINT";  nullable = true  }
  column { name = "corrected";       type = "BIGINT";  nullable = true  }
  column { name = "invalid";         type = "BIGINT";  nullable = true  }
  column { name = "cache_hits";      type = "BIGINT";  nullable = true  }
  column { name = "avg_response_ms"; type = "DOUBLE";  nullable = true  }
  column { name = "bedrock_calls";   type = "BIGINT";  nullable = true  }
  column { name = "sagemaker_calls"; type = "BIGINT";  nullable = true  }
  column { name = "usps_calls";      type = "BIGINT";  nullable = true  }

  depends_on = [databricks_schema.analytics]
}

# ── Grant Lambda service account read/write on all tables ────
resource "databricks_grants" "results_rw" {
  table = "${databricks_catalog.addresses.name}.${databricks_schema.verified.name}.${databricks_sql_table.results.name}"
  grant {
    principal  = var.databricks_lambda_principal
    privileges = ["SELECT", "INSERT", "MODIFY"]
  }
}

resource "databricks_grants" "training_rw" {
  table = "${databricks_catalog.addresses.name}.${databricks_schema.ml.name}.${databricks_sql_table.training_data.name}"
  grant {
    principal  = var.databricks_lambda_principal
    privileges = ["SELECT", "INSERT"]
  }
}

resource "databricks_grants" "stats_r" {
  table = "${databricks_catalog.addresses.name}.${databricks_schema.analytics.name}.${databricks_sql_table.daily_stats.name}"
  grant {
    principal  = var.databricks_lambda_principal
    privileges = ["SELECT", "INSERT", "MODIFY"]
  }
}
