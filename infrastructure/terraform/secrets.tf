# ============================================================
# secrets.tf — AWS Secrets Manager entries
#
# Stores credentials for all backend integrations:
#   • USPS OAuth2 consumer key + secret
#   • Databricks host, token, warehouse ID
#   • Redis AUTH token (auto-generated)
#   • OpenSearch master credentials (auto-generated)
# ============================================================

resource "random_password" "redis_auth" {
  length  = 32
  special = false   # ElastiCache AUTH token must be alphanumeric
}

resource "random_password" "opensearch_master_password" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ── USPS API credentials ──────────────────────────────────────
resource "aws_secretsmanager_secret" "usps" {
  name        = "${var.project_name}/${var.environment}/usps-api"
  description = "USPS OAuth2 API credentials (consumer_key, consumer_secret)"
  kms_key_id  = var.kms_key_arn != "" ? var.kms_key_arn : null

  tags = { Name = "${var.project_name}-secret-usps-${var.environment}" }
}

resource "aws_secretsmanager_secret_version" "usps" {
  secret_id = aws_secretsmanager_secret.usps.id
  secret_string = jsonencode({
    consumer_key    = var.usps_consumer_key
    consumer_secret = var.usps_consumer_secret
  })

  lifecycle {
    ignore_changes = [secret_string]   # Allow manual rotation without Terraform drift
  }
}

# ── Databricks credentials ────────────────────────────────────
resource "aws_secretsmanager_secret" "databricks" {
  name        = "${var.project_name}/${var.environment}/databricks"
  description = "Databricks workspace host, PAT token, SQL warehouse ID"
  kms_key_id  = var.kms_key_arn != "" ? var.kms_key_arn : null

  tags = { Name = "${var.project_name}-secret-databricks-${var.environment}" }
}

resource "aws_secretsmanager_secret_version" "databricks" {
  secret_id = aws_secretsmanager_secret.databricks.id
  secret_string = jsonencode({
    host         = var.databricks_host
    token        = var.databricks_token
    warehouse_id = var.databricks_warehouse_id
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Redis AUTH token ──────────────────────────────────────────
resource "aws_secretsmanager_secret" "redis" {
  name        = "${var.project_name}/${var.environment}/redis-auth"
  description = "ElastiCache Redis AUTH token (auto-generated)"
  kms_key_id  = var.kms_key_arn != "" ? var.kms_key_arn : null

  tags = { Name = "${var.project_name}-secret-redis-${var.environment}" }
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id     = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({ auth_token = random_password.redis_auth.result })
}

# ── OpenSearch master credentials ────────────────────────────
resource "aws_secretsmanager_secret" "opensearch" {
  name        = "${var.project_name}/${var.environment}/opensearch-master"
  description = "OpenSearch Service master user credentials (auto-generated)"
  kms_key_id  = var.kms_key_arn != "" ? var.kms_key_arn : null

  tags = { Name = "${var.project_name}-secret-opensearch-${var.environment}" }
}

resource "aws_secretsmanager_secret_version" "opensearch" {
  secret_id = aws_secretsmanager_secret.opensearch.id
  secret_string = jsonencode({
    username = "admin"
    password = random_password.opensearch_master_password.result
  })
}
