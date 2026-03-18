# ============================================================
# provider.tf — AWS GovCloud Provider Configuration
# Targets the us-gov-west-1 or us-gov-east-1 region.
# Set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
# for the GovCloud partition (aws-us-gov).
# ============================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3 (optional — uncomment and fill in for team use)
  # backend "s3" {
  #   bucket         = "your-tfstate-bucket-govcloud"
  #   key            = "address-tool/terraform.tfstate"
  #   region         = "us-gov-west-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-lock"
  # }
}

# Primary provider — GovCloud West (us-gov-west-1)
provider "aws" {
  region = var.aws_region

  # Tag all resources with common metadata
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = var.owner_tag
    }
  }
}

# ACM certificates for CloudFront MUST be in us-east-1 even in GovCloud.
# Uncomment this provider alias only if you intend to use a custom domain
# with CloudFront and manage the certificate through Terraform.
# provider "aws" {
#   alias  = "us_east_1"
#   region = "us-east-1"
# }
