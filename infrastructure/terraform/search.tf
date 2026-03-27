# ============================================================
# search.tf — Amazon OpenSearch Service domain (GovCloud)
#
# Creates:
#   • OpenSearch domain (VPC-enabled, encrypted, fine-grained AC)
#   • Service-linked role for VPC access
#   • Domain access policy (Lambda IAM role)
# ============================================================

# ── Service-linked role (required once per account) ──────────
resource "aws_iam_service_linked_role" "opensearch" {
  count            = var.create_opensearch_slr ? 1 : 0
  aws_service_name = "opensearchservice.amazonaws.com"
}

# ── OpenSearch Domain ────────────────────────────────────────
resource "aws_opensearch_domain" "main" {
  domain_name    = "${var.project_name}-${var.environment}"
  engine_version = "OpenSearch_${var.opensearch_version}"

  # ── Cluster ──────────────────────────────────────────────
  cluster_config {
    instance_type          = var.opensearch_instance_type
    instance_count         = var.opensearch_instance_count
    zone_awareness_enabled = var.opensearch_instance_count > 1

    dynamic "zone_awareness_config" {
      for_each = var.opensearch_instance_count > 1 ? [1] : []
      content {
        availability_zone_count = 2
      }
    }
  }

  # ── Storage ──────────────────────────────────────────────
  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.opensearch_volume_size_gb
    throughput  = 125
  }

  # ── VPC (private subnets) ─────────────────────────────────
  vpc_options {
    subnet_ids         = var.opensearch_instance_count > 1
      ? aws_subnet.private[*].id
      : [aws_subnet.private[0].id]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  # ── Encryption ────────────────────────────────────────────
  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_arn != "" ? var.kms_key_arn : null
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https                   = true
    tls_security_policy             = "Policy-Min-TLS-1-2-2019-07"
    custom_endpoint_enabled         = false
  }

  # ── Fine-grained access control ──────────────────────────
  advanced_security_options {
    enabled                        = true
    anonymous_auth_enabled         = false
    internal_user_database_enabled = true

    master_user_options {
      master_user_name     = "admin"
      master_user_password = random_password.opensearch_master_password.result
    }
  }

  # ── Logging ──────────────────────────────────────────────
  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_index.arn
    log_type                 = "INDEX_SLOW_LOGS"
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_search.arn
    log_type                 = "SEARCH_SLOW_LOGS"
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_error.arn
    log_type                 = "ES_APPLICATION_LOGS"
  }

  tags = {
    Name        = "${var.project_name}-opensearch-${var.environment}"
    Environment = var.environment
  }

  depends_on = [
    aws_iam_service_linked_role.opensearch,
    aws_secretsmanager_secret_version.opensearch
  ]
}

# ── Access policy — allow Lambda role + master user ──────────
resource "aws_opensearch_domain_policy" "main" {
  domain_name = aws_opensearch_domain.main.domain_name

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.lambda.arn }
        Action    = "es:*"
        Resource  = "${aws_opensearch_domain.main.arn}/*"
      }
    ]
  })
}

# ── CloudWatch Log Groups ────────────────────────────────────
resource "aws_cloudwatch_log_group" "opensearch_index" {
  name              = "/aws/opensearch/${var.project_name}-${var.environment}/index-slow"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "opensearch_search" {
  name              = "/aws/opensearch/${var.project_name}-${var.environment}/search-slow"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "opensearch_error" {
  name              = "/aws/opensearch/${var.project_name}-${var.environment}/application"
  retention_in_days = 30
}

# ── Log resource policy (allows OpenSearch to write to CW) ───
resource "aws_cloudwatch_log_resource_policy" "opensearch" {
  policy_name = "${var.project_name}-opensearch-cw-${var.environment}"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "es.amazonaws.com" }
      Action    = ["logs:PutLogEvents", "logs:CreateLogStream"]
      Resource  = [
        "${aws_cloudwatch_log_group.opensearch_index.arn}:*",
        "${aws_cloudwatch_log_group.opensearch_search.arn}:*",
        "${aws_cloudwatch_log_group.opensearch_error.arn}:*"
      ]
    }]
  })
}
