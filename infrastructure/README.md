# Infrastructure — AWS GovCloud Deployment

This directory contains all infrastructure-as-code (IaC) and deployment tooling
to host the Address Summary Organizing Tool as a static website on **AWS GovCloud (US)**.

---

## Architecture Overview

```
Browser → CloudFront (HTTPS, edge caching, security headers)
              ↓
          S3 Bucket (static files, OAC-private, AES-256 encrypted)
              ↓ (optional)
          Access Log Bucket
```

| Component | Service | Notes |
|-----------|---------|-------|
| Static files | Amazon S3 | AES-256 SSE, versioning, no public access |
| CDN / HTTPS | Amazon CloudFront | OAC, TLS 1.2+, security headers |
| Access logs | Amazon S3 (log bucket) | S3 + CloudFront access logs |
| CI/CD | GitHub Actions | Auto-deploys on push to `main`/`develop` |

**GovCloud Regions:** `us-gov-west-1` (primary) · `us-gov-east-1`

---

## Directory Structure

```
infrastructure/
├── terraform/
│   ├── provider.tf           AWS GovCloud Terraform provider
│   ├── main.tf               S3, CloudFront, OAC, security headers, logging
│   ├── variables.tf          All configurable input variables
│   └── outputs.tf            Bucket name, CloudFront URL, deploy commands
├── cloudformation/
│   └── template.yaml         CloudFormation alternative (same resources)
├── iam-deploy-policy.json    Minimal IAM policy for the CI/CD deploy user
└── README.md                 This file

scripts/
├── deploy.sh                 Linux/macOS deploy script (AWS CLI)
└── deploy.ps1                Windows PowerShell deploy script (AWS CLI)

.github/workflows/
└── deploy.yml                GitHub Actions CI/CD pipeline
```

---

## Prerequisites

1. **AWS CLI v2** installed and configured for GovCloud
2. **AWS credentials** with the permissions in `iam-deploy-policy.json`
3. **Terraform ≥ 1.5** (if using the Terraform path)
4. **Python 3** (used by deploy scripts to parse JSON)

---

## Option A — Terraform Deployment

### 1. Authenticate to GovCloud

```bash
# Using named profile (recommended)
aws configure --profile govcloud
# Enter GovCloud access key, secret, region (us-gov-west-1), output (json)

export AWS_PROFILE=govcloud
```

### 2. Initialise Terraform

```bash
cd infrastructure/terraform
terraform init
```

### 3. Plan

```bash
# Minimal config — auto-generated bucket name
terraform plan \
  -var="environment=prod" \
  -var="owner_tag=your-team"

# With custom domain
terraform plan \
  -var="custom_domain=address-tool.agency.gov" \
  -var="acm_certificate_arn=arn:aws-us-gov:acm:us-east-1:123456789012:certificate/xxx"
```

### 4. Apply

```bash
terraform apply
```

### 5. Deploy site files

Terraform outputs the exact sync command after `apply`:

```bash
# Copy the output value of "deploy_command" and run it, e.g.:
aws s3 sync ../../ s3://address-tool-prod-a1b2c3d4 \
  --delete \
  --exclude 'infrastructure/*' \
  --exclude 'scripts/*' \
  --region us-gov-west-1
```

### 6. Invalidate CloudFront cache

```bash
# Copy the output value of "invalidate_command", e.g.:
aws cloudfront create-invalidation \
  --distribution-id E1ABCDEFGHIJKL \
  --paths "/*" \
  --region us-gov-west-1
```

---

## Option B — CloudFormation Deployment

```bash
# Create stack
aws cloudformation create-stack \
  --stack-name address-tool-prod \
  --template-body file://infrastructure/cloudformation/template.yaml \
  --parameters \
      ParameterKey=ProjectName,ParameterValue=address-tool \
      ParameterKey=Environment,ParameterValue=prod \
      ParameterKey=EnableCloudFront,ParameterValue=true \
  --region us-gov-west-1 \
  --capabilities CAPABILITY_NAMED_IAM

# Wait for stack creation
aws cloudformation wait stack-create-complete \
  --stack-name address-tool-prod \
  --region us-gov-west-1

# Get outputs
aws cloudformation describe-stacks \
  --stack-name address-tool-prod \
  --query 'Stacks[0].Outputs' \
  --region us-gov-west-1

# Update existing stack
aws cloudformation update-stack \
  --stack-name address-tool-prod \
  --template-body file://infrastructure/cloudformation/template.yaml \
  --parameters \
      ParameterKey=ProjectName,UsePreviousValue=true \
      ParameterKey=Environment,UsePreviousValue=true \
  --region us-gov-west-1
```

---

## Option C — Deploy Scripts (AWS CLI only, no IaC)

If the S3 bucket and CloudFront distribution already exist, use the deploy scripts:

### Linux / macOS

```bash
chmod +x scripts/deploy.sh

# Basic deploy
./scripts/deploy.sh --bucket my-address-tool-bucket

# With CloudFront invalidation
./scripts/deploy.sh \
  --bucket  my-address-tool-bucket \
  --distribution E1ABCDEFGHIJKL \
  --region  us-gov-west-1

# Using a named AWS profile
./scripts/deploy.sh \
  --bucket  my-address-tool-bucket \
  --profile govcloud-deploy \
  --yes
```

### Windows PowerShell

```powershell
# Basic deploy
.\scripts\deploy.ps1 -BucketName "my-address-tool-bucket"

# With CloudFront invalidation
.\scripts\deploy.ps1 `
    -BucketName      "my-address-tool-bucket" `
    -DistributionId  "E1ABCDEFGHIJKL" `
    -Region          "us-gov-west-1"

# Using a named AWS profile
.\scripts\deploy.ps1 `
    -BucketName  "my-address-tool-bucket" `
    -Profile     "govcloud-deploy" `
    -SkipConfirm
```

---

## Option D — GitHub Actions CI/CD

The workflow at `.github/workflows/deploy.yml` automatically deploys on every push.

### Setup steps

1. **Create IAM user** (or role) with the permissions in `iam-deploy-policy.json`.

2. **Add GitHub Secrets** in your repository settings
   (`Settings → Secrets → Actions`):

   | Secret | Description |
   |--------|-------------|
   | `AWS_ACCESS_KEY_ID_GOVCLOUD` | GovCloud IAM access key |
   | `AWS_SECRET_ACCESS_KEY_GOVCLOUD` | GovCloud IAM secret key |
   | `S3_BUCKET_PROD` | Production S3 bucket name |
   | `S3_BUCKET_STAGING` | Staging S3 bucket name |
   | `CLOUDFRONT_DIST_ID_PROD` | Prod CloudFront distribution ID |
   | `CLOUDFRONT_DIST_ID_STAGING` | Staging CloudFront distribution ID |
   | `SLACK_WEBHOOK_URL` | *(optional)* Slack deploy notifications |

3. **Push to `main`** → deploys to production.  
   **Push to `develop`** → deploys to staging.  
   **Manual trigger** → choose environment from the Actions tab.

---

## IAM Permissions

The minimum IAM policy for the deploy user is in `iam-deploy-policy.json`.
Replace `YOUR_BUCKET_NAME`, `YOUR_ACCOUNT_ID`, and `YOUR_DISTRIBUTION_ID`
with your actual values before attaching the policy.

```bash
# Create policy
aws iam create-policy \
  --policy-name AddressToolDeployPolicy \
  --policy-document file://infrastructure/iam-deploy-policy.json \
  --region us-gov-west-1

# Attach to IAM user
aws iam attach-user-policy \
  --user-name address-tool-deploy \
  --policy-arn arn:aws-us-gov:iam::YOUR_ACCOUNT_ID:policy/AddressToolDeployPolicy \
  --region us-gov-west-1
```

---

## Terraform Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-gov-west-1` | GovCloud region |
| `project_name` | `address-tool` | Used in resource names |
| `environment` | `prod` | dev / staging / prod |
| `bucket_name` | *(auto)* | Override S3 bucket name |
| `enable_cloudfront` | `true` | Create CloudFront distribution |
| `cloudfront_price_class` | `PriceClass_100` | Edge node scope |
| `custom_domain` | *(empty)* | Custom domain (requires ACM cert) |
| `acm_certificate_arn` | *(empty)* | ACM cert ARN (us-east-1) |
| `enable_waf` | `false` | Attach WAFv2 Web ACL |
| `waf_web_acl_arn` | *(empty)* | Existing WAF ACL ARN |
| `enable_access_logging` | `true` | S3 + CloudFront logs |
| `versioning_enabled` | `true` | S3 object versioning |
| `force_destroy_bucket` | `false` | Allow bucket deletion with objects |

---

## Security Considerations

- All S3 buckets block public access; content served exclusively via CloudFront OAC.
- All S3 objects are AES-256 encrypted at rest.
- All S3 and CloudFront traffic requires HTTPS (TLS 1.2 minimum).
- CloudFront security headers enforced: HSTS, X-Frame-Options (DENY), XSS Protection, Content-Type Options, Referrer-Policy.
- IAM deploy user uses least-privilege policy.
- Optional WAFv2 support for additional request filtering.

---

## GovCloud Notes

- **Partition:** `aws-us-gov` (used in ARNs instead of `aws`)
- **Regions:** `us-gov-west-1`, `us-gov-east-1`
- **CloudFront domain:** `*.cloudfront.amazonaws-us-gov.com`
- **S3 website endpoint:** `<bucket>.s3-website-us-gov-west-1.amazonaws.com`
- **ACM certificates for CloudFront** must be in `us-east-1` even in GovCloud
- **FedRAMP High** compliant when using S3 + CloudFront with the configuration above
