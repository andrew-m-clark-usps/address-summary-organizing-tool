# ============================================================
# main.tf — Core AWS GovCloud Infrastructure
#
# Resources created:
#   1. Random suffix  (ensures unique bucket names)
#   2. S3 bucket      (static website hosting)
#   3. S3 bucket policy (public read OR private + OAC)
#   4. CloudFront OAC + Distribution (HTTPS, edge caching)
#   5. Access log bucket (optional)
#   6. S3 website files upload (null_resource + AWS CLI)
# ============================================================

# ── 1. Random suffix for globally-unique names ────────────────
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket_name     = var.bucket_name != "" ? var.bucket_name : "${var.project_name}-${var.environment}-${random_id.suffix.hex}"
  log_bucket_name = var.log_bucket_name != "" ? var.log_bucket_name : "${local.bucket_name}-logs"
}

# ── 2. S3 Bucket — Static Website Hosting ────────────────────
resource "aws_s3_bucket" "site" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy_bucket

  tags = {
    Name    = local.bucket_name
    Purpose = "Static website — Address Summary Organizing Tool"
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

# Block all public access — CloudFront OAC will serve content via bucket policy
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Website configuration (used when CloudFront is disabled as a fallback)
resource "aws_s3_bucket_website_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# CORS — needed if the SPA loads assets from a different origin (e.g., custom domain)
resource "aws_s3_bucket_cors_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}

# ── 3a. Access Log Bucket (optional) ─────────────────────────
resource "aws_s3_bucket" "logs" {
  count         = var.enable_access_logging ? 1 : 0
  bucket        = local.log_bucket_name
  force_destroy = true

  tags = {
    Name    = local.log_bucket_name
    Purpose = "Access logs for ${local.bucket_name}"
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  count  = var.enable_access_logging ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  count  = var.enable_access_logging ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_logging" "site" {
  count  = var.enable_access_logging ? 1 : 0
  bucket = aws_s3_bucket.site.id

  target_bucket = aws_s3_bucket.logs[0].id
  target_prefix = "s3-access-logs/"
}

# ── 3b. S3 Bucket Policy (grants CloudFront OAC read access) ─
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      # CloudFront OAC access (only when CloudFront is enabled)
      var.enable_cloudfront ? [{
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.site[0].arn
          }
        }
      }] : [],
      # Deny non-HTTPS requests
      [{
        Sid       = "DenyNonHTTPS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.site.arn,
          "${aws_s3_bucket.site.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }]
    )
  })

  depends_on = [
    aws_s3_bucket_public_access_block.site,
    aws_cloudfront_distribution.site
  ]
}

# ── 4a. CloudFront Origin Access Control ─────────────────────
resource "aws_cloudfront_origin_access_control" "site" {
  count = var.enable_cloudfront ? 1 : 0

  name                              = "${local.bucket_name}-oac"
  description                       = "OAC for ${local.bucket_name} static site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── 4b. CloudFront Distribution ──────────────────────────────
resource "aws_cloudfront_distribution" "site" {
  count = var.enable_cloudfront ? 1 : 0

  comment             = "Address Summary Organizing Tool — ${var.environment}"
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  web_acl_id          = var.enable_waf ? var.waf_web_acl_arn : null
  http_version        = "http2and3"

  # Custom aliases (only when a domain + certificate are provided)
  aliases = var.custom_domain != "" ? [var.custom_domain] : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-${local.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.site[0].id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-${local.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    default_ttl            = var.cloudfront_default_ttl
    max_ttl                = var.cloudfront_max_ttl
    min_ttl                = 0

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # Security headers
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id
  }

  # Serve index.html on 403/404 (SPA support)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  # SSL
  viewer_certificate {
    # Use custom certificate when a domain is provided
    acm_certificate_arn      = var.custom_domain != "" ? var.acm_certificate_arn : null
    ssl_support_method       = var.custom_domain != "" ? "sni-only" : null
    minimum_protocol_version = var.custom_domain != "" ? "TLSv1.2_2021" : null
    # Fall back to CloudFront default certificate
    cloudfront_default_certificate = var.custom_domain == ""
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Access logging
  dynamic "logging_config" {
    for_each = var.enable_access_logging ? [1] : []
    content {
      bucket          = aws_s3_bucket.logs[0].bucket_domain_name
      prefix          = "cloudfront-logs/"
      include_cookies = false
    }
  }

  tags = {
    Name = "${var.project_name}-cf-${var.environment}"
  }

  depends_on = [aws_s3_bucket_policy.site]
}

# ── 4c. CloudFront Security Response Headers Policy ──────────
resource "aws_cloudfront_response_headers_policy" "security" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "${var.project_name}-security-headers-${var.environment}-${random_id.suffix.hex}"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

# ── 5. CloudFront Invalidation (triggered on deploy) ─────────
# Run via the deploy script rather than Terraform to avoid
# storing invalidation IDs in state.
