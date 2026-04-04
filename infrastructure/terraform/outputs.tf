# ============================================================
# outputs.tf — Terraform Output Values
# ============================================================

output "bucket_name" {
  description = "Name of the S3 bucket hosting the static site."
  value       = aws_s3_bucket.site.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.site.arn
}

output "bucket_regional_domain" {
  description = "Regional domain name of the S3 bucket (used as CloudFront origin)."
  value       = aws_s3_bucket.site.bucket_regional_domain_name
}

output "s3_website_endpoint" {
  description = "S3 static website endpoint (HTTP only). Use CloudFront URL for HTTPS."
  value       = aws_s3_bucket_website_configuration.site.website_endpoint
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution (needed for cache invalidation)."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].id : null
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].arn : null
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name (*.cloudfront.amazonaws-us-gov.com)."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].domain_name : null
}

output "site_url" {
  description = "Primary URL to access the deployed site."
  value = var.custom_domain != "" ? "https://${var.custom_domain}" : (
    var.enable_cloudfront
    ? "https://${aws_cloudfront_distribution.site[0].domain_name}"
    : "http://${aws_s3_bucket_website_configuration.site.website_endpoint}"
  )
}

output "log_bucket_name" {
  description = "S3 bucket storing access logs."
  value       = var.enable_access_logging ? aws_s3_bucket.logs[0].id : null
}

output "aws_region" {
  description = "AWS GovCloud region where resources were deployed."
  value       = var.aws_region
}

output "environment" {
  description = "Deployment environment."
  value       = var.environment
}

output "deploy_command" {
  description = "AWS CLI command to sync local site files to the S3 bucket."
  value       = "aws s3 sync ../../ s3://${aws_s3_bucket.site.id} --delete --exclude '*.git/*' --exclude 'infrastructure/*' --exclude 'scripts/*' --exclude '*.md' --region ${var.aws_region}"
}

output "invalidate_command" {
  description = "AWS CLI command to invalidate the CloudFront cache after deployment."
  value = var.enable_cloudfront ? (
    "aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.site[0].id} --paths '/*' --region ${var.aws_region}"
  ) : "CloudFront not enabled"
}

# ════════════════════════════════════════════════════════════
# VPC
# ════════════════════════════════════════════════════════════

output "vpc_id" {
  description = "VPC ID hosting Lambda, Redis, and OpenSearch."
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (Lambda, Redis, OpenSearch)."
  value       = aws_subnet.private[*].id
}

output "lambda_security_group_id" {
  description = "Security group ID attached to the Lambda function."
  value       = aws_security_group.lambda.id
}

# ════════════════════════════════════════════════════════════
# API Gateway + Lambda
# ════════════════════════════════════════════════════════════

output "api_gateway_endpoint" {
  description = "Base URL of the API Gateway stage (use this in verify.html configuration)."
  value       = "${aws_api_gateway_rest_api.verify.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}"
}

output "api_gateway_id" {
  description = "API Gateway REST API ID."
  value       = aws_api_gateway_rest_api.verify.id
}

output "api_admin_key_id" {
  description = "API Gateway admin key ID (retrieve value from AWS Console or CLI)."
  value       = aws_api_gateway_api_key.admin.id
}

output "api_user_key_id" {
  description = "API Gateway user key ID."
  value       = aws_api_gateway_api_key.user.id
}

output "lambda_function_name" {
  description = "Lambda function name (used by deploy workflow)."
  value       = aws_lambda_function.verify.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN."
  value       = aws_lambda_function.verify.arn
}

# ════════════════════════════════════════════════════════════
# Redis
# ════════════════════════════════════════════════════════════

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint (Lambda REDIS_HOST env var)."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "ElastiCache Redis port."
  value       = 6379
}

# ════════════════════════════════════════════════════════════
# OpenSearch
# ════════════════════════════════════════════════════════════

output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint (Lambda OPENSEARCH_ENDPOINT env var)."
  value       = aws_opensearch_domain.main.endpoint
}

output "opensearch_arn" {
  description = "OpenSearch domain ARN."
  value       = aws_opensearch_domain.main.arn
}

# ════════════════════════════════════════════════════════════
# Secrets Manager ARNs
# ════════════════════════════════════════════════════════════

output "usps_secret_arn" {
  description = "ARN of the USPS API credentials secret."
  value       = aws_secretsmanager_secret.usps.arn
}

output "databricks_secret_arn" {
  description = "ARN of the Databricks credentials secret."
  value       = aws_secretsmanager_secret.databricks.arn
}

output "redis_secret_arn" {
  description = "ARN of the Redis AUTH token secret."
  value       = aws_secretsmanager_secret.redis.arn
}

output "opensearch_secret_arn" {
  description = "ARN of the OpenSearch master credentials secret."
  value       = aws_secretsmanager_secret.opensearch.arn
}

# ════════════════════════════════════════════════════════════
# SageMaker
# ════════════════════════════════════════════════════════════

output "sagemaker_execution_role_arn" {
  description = "SageMaker execution role ARN (use when creating Training Jobs and Batch Transform jobs)."
  value       = aws_iam_role.sagemaker.arn
}

output "nightly_batch_rule_arn" {
  description = "EventBridge rule ARN for the nightly SageMaker batch job."
  value       = aws_cloudwatch_event_rule.nightly_batch.arn
}

# ════════════════════════════════════════════════════════════
# Databricks
# ════════════════════════════════════════════════════════════

output "databricks_results_table" {
  description = "Fully qualified Databricks Delta table name for verified results."
  value       = "${var.databricks_catalog}.verified.results"
}

output "databricks_warehouse_id" {
  description = "Databricks SQL warehouse ID."
  value       = var.databricks_warehouse_id
}

# ════════════════════════════════════════════════════════════
# Helper commands
# ════════════════════════════════════════════════════════════

output "lambda_deploy_command" {
  description = "AWS CLI command to deploy a new Lambda package."
  value       = "aws lambda update-function-code --function-name ${aws_lambda_function.verify.function_name} --zip-file fileb://infrastructure/lambda-package/lambda.zip --region ${var.aws_region}"
}

output "api_invoke_url" {
  description = "Full API Gateway invoke URL for the /verify endpoint."
  value       = "https://${aws_api_gateway_rest_api.verify.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}/verify"
}
