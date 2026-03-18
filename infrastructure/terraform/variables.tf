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
