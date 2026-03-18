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
