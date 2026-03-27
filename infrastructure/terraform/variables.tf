# ============================================================
# variables.tf — Input Variables
# ============================================================

# ── AWS / Region ─────────────────────────────────────────────
variable "aws_region" {
  description = "AWS GovCloud region. Valid values: us-gov-west-1 | us-gov-east-1"
  type        = string
  default     = "us-gov-west-1"

  validation {
    condition     = contains(["us-gov-west-1", "us-gov-east-1"], var.aws_region)
    error_message = "aws_region must be a valid AWS GovCloud region: us-gov-west-1 or us-gov-east-1."
  }
}

# ── Project / Naming ─────────────────────────────────────────
variable "project_name" {
  description = "Short name used in resource names and tags (lowercase letters, numbers, hyphens only)."
  type        = string
  default     = "address-tool"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "project_name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  description = "Deployment environment label (dev | staging | prod)."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "owner_tag" {
  description = "Team or individual responsible for this deployment (used in resource tags)."
  type        = string
  default     = "address-team"
}

# ── S3 ───────────────────────────────────────────────────────
variable "bucket_name" {
  description = <<-EOT
    Globally unique S3 bucket name.  If left empty, a name is generated from
    project_name + environment + a random suffix.
    Must comply with S3 bucket naming rules (3-63 chars, lowercase, no underscores).
  EOT
  type        = string
  default     = ""
}

variable "force_destroy_bucket" {
  description = "Allow Terraform to delete the S3 bucket even when it contains objects. Set to false for production."
  type        = bool
  default     = false
}

variable "versioning_enabled" {
  description = "Enable S3 object versioning. Recommended for production deployments."
  type        = bool
  default     = true
}

# ── CloudFront ───────────────────────────────────────────────
variable "enable_cloudfront" {
  description = "Create a CloudFront distribution in front of S3. Provides HTTPS and global edge caching."
  type        = bool
  default     = true
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_100 = US/Europe edge nodes (lowest cost)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "cloudfront_default_ttl" {
  description = "Default cache TTL (seconds) for CloudFront. 3600 = 1 hour."
  type        = number
  default     = 3600
}

variable "cloudfront_max_ttl" {
  description = "Maximum cache TTL (seconds) for CloudFront. 86400 = 24 hours."
  type        = number
  default     = 86400
}

variable "custom_domain" {
  description = "Custom domain name (e.g., address-tool.agency.gov). Leave empty to use the CloudFront or S3 default URL."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = <<-EOT
    ARN of the ACM certificate for the custom_domain.  Required when custom_domain is set.
    The certificate must be in us-east-1 and validated before applying.
    Example: arn:aws-us-gov:acm:us-east-1:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  EOT
  type        = string
  default     = ""
}

# ── WAF ──────────────────────────────────────────────────────
variable "enable_waf" {
  description = <<-EOT
    Associate an AWS WAFv2 Web ACL with the CloudFront distribution.
    Set waf_web_acl_arn to the ARN of an existing WAF ACL.
  EOT
  type        = bool
  default     = false
}

variable "waf_web_acl_arn" {
  description = "ARN of an existing AWS WAFv2 Web ACL (must be in us-east-1 for CloudFront)."
  type        = string
  default     = ""
}

# ── Access Logging ───────────────────────────────────────────
variable "enable_access_logging" {
  description = "Enable S3 server-access logging and CloudFront access logs."
  type        = bool
  default     = true
}

variable "log_bucket_name" {
  description = "S3 bucket name for access logs. Auto-generated if empty."
  type        = string
  default     = ""
}

# ── Deployment ───────────────────────────────────────────────
variable "local_site_directory" {
  description = "Local path to the static site files to upload (relative to the terraform directory or absolute)."
  type        = string
  default     = "../../"
}

# ════════════════════════════════════════════════════════════
# VPC Networking
# ════════════════════════════════════════════════════════════

variable "vpc_cidr" {
  description = "CIDR block for the VPC. Subnets are carved from this range."
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Create NAT Gateway(s) for Lambda outbound internet access (USPS API, Databricks, Bedrock)."
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway (lower cost). Set false for multi-AZ HA in production."
  type        = bool
  default     = true
}

# ════════════════════════════════════════════════════════════
# ElastiCache Redis
# ════════════════════════════════════════════════════════════

variable "redis_node_type" {
  description = "ElastiCache node type. Use cache.t3.micro for dev, cache.r7g.large for prod."
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_replicas" {
  description = "Number of Redis read replicas (0 = no HA, 1 = single replica with failover)."
  type        = number
  default     = 0

  validation {
    condition     = var.redis_num_replicas >= 0 && var.redis_num_replicas <= 5
    error_message = "redis_num_replicas must be between 0 and 5."
  }
}

# ════════════════════════════════════════════════════════════
# OpenSearch Service
# ════════════════════════════════════════════════════════════

variable "opensearch_version" {
  description = "OpenSearch engine version string (e.g. 2.11)."
  type        = string
  default     = "2.11"
}

variable "opensearch_instance_type" {
  description = "OpenSearch instance type. Use t3.small.search for dev, r6g.large.search for prod."
  type        = string
  default     = "t3.small.search"
}

variable "opensearch_instance_count" {
  description = "Number of OpenSearch data nodes (1 = dev, 2 = prod multi-AZ)."
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 2, 3], var.opensearch_instance_count)
    error_message = "opensearch_instance_count must be 1, 2, or 3."
  }
}

variable "opensearch_volume_size_gb" {
  description = "EBS gp3 volume size per OpenSearch node in GB."
  type        = number
  default     = 20
}

variable "create_opensearch_slr" {
  description = "Create the OpenSearch service-linked role. Set false if it already exists in the account."
  type        = bool
  default     = true
}

# ════════════════════════════════════════════════════════════
# Lambda
# ════════════════════════════════════════════════════════════

variable "lambda_memory_mb" {
  description = "Lambda function memory in MB."
  type        = number
  default     = 512
}

variable "lambda_timeout_sec" {
  description = "Lambda function timeout in seconds (max 900)."
  type        = number
  default     = 30
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrent executions for the Lambda function (-1 = unreserved)."
  type        = number
  default     = -1
}

variable "enable_xray" {
  description = "Enable AWS X-Ray active tracing on Lambda and API Gateway."
  type        = bool
  default     = true
}

# ════════════════════════════════════════════════════════════
# API Gateway
# ════════════════════════════════════════════════════════════

variable "cors_origin" {
  description = "Allowed CORS origin for API Gateway responses (e.g. https://your-cloudfront-domain.com). Use * for dev."
  type        = string
  default     = "*"
}

variable "enable_api_waf" {
  description = "Attach a WAFv2 WebACL (managed rules) to the API Gateway stage."
  type        = bool
  default     = true
}

# ════════════════════════════════════════════════════════════
# USPS API
# ════════════════════════════════════════════════════════════

variable "usps_api_base_url" {
  description = "USPS API base URL."
  type        = string
  default     = "https://apis.usps.com"
}

variable "usps_consumer_key" {
  description = "USPS OAuth2 consumer key. Stored in Secrets Manager — provide via tfvars or env var."
  type        = string
  sensitive   = true
  default     = "REPLACE_WITH_USPS_CONSUMER_KEY"
}

variable "usps_consumer_secret" {
  description = "USPS OAuth2 consumer secret. Stored in Secrets Manager — provide via tfvars or env var."
  type        = string
  sensitive   = true
  default     = "REPLACE_WITH_USPS_CONSUMER_SECRET"
}

# ════════════════════════════════════════════════════════════
# Databricks
# ════════════════════════════════════════════════════════════

variable "databricks_host" {
  description = "Databricks workspace hostname (e.g. adb-1234567890.12.azuredatabricks.net)."
  type        = string
  default     = ""
}

variable "databricks_token" {
  description = "Databricks personal access token (PAT). Stored in Secrets Manager."
  type        = string
  sensitive   = true
  default     = ""
}

variable "databricks_warehouse_id" {
  description = "Databricks SQL Serverless warehouse ID."
  type        = string
  default     = ""
}

variable "databricks_catalog" {
  description = "Databricks Unity Catalog name for address data."
  type        = string
  default     = "addresses"
}

variable "databricks_schema" {
  description = "Databricks schema name for verified address records."
  type        = string
  default     = "verified"
}

variable "databricks_lambda_principal" {
  description = "Databricks principal (service principal app ID or email) to grant table access."
  type        = string
  default     = ""
}

# ════════════════════════════════════════════════════════════
# Bedrock
# ════════════════════════════════════════════════════════════

variable "bedrock_model_haiku" {
  description = "Bedrock model ID for Claude 3.5 Haiku (freeform parsing, correction suggestions)."
  type        = string
  default     = "anthropic.claude-3-5-haiku-20241022-v1:0"
}

variable "bedrock_model_sonnet" {
  description = "Bedrock model ID for Claude 3 Sonnet (complex/multi-language addresses)."
  type        = string
  default     = "anthropic.claude-3-sonnet-20240229-v1:0"
}

variable "bedrock_model_embed" {
  description = "Bedrock model ID for Amazon Titan Embeddings V2 (address similarity vectors)."
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "enable_bedrock_knn" {
  description = "Enable Titan Embeddings + OpenSearch k-NN for semantic address search."
  type        = bool
  default     = false
}

# ════════════════════════════════════════════════════════════
# SageMaker
# ════════════════════════════════════════════════════════════

variable "sagemaker_ner_endpoint_name" {
  description = "Name of the SageMaker real-time NER endpoint (BERT fine-tuned on USPS CASS data)."
  type        = string
  default     = ""
}

variable "sagemaker_score_endpoint_name" {
  description = "Name of the SageMaker serverless scoring endpoint (XGBoost confidence model)."
  type        = string
  default     = ""
}

variable "enable_nightly_batch" {
  description = "Enable EventBridge rules for nightly SageMaker Batch Transform and Bedrock correction jobs."
  type        = bool
  default     = false
}

# ════════════════════════════════════════════════════════════
# Security
# ════════════════════════════════════════════════════════════

variable "kms_key_arn" {
  description = "ARN of a KMS CMK for encrypting ElastiCache, OpenSearch, and Secrets Manager. Leave empty to use AWS-managed keys."
  type        = string
  default     = ""
}
