#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy Address Summary Organizing Tool to AWS GovCloud S3
#
# Usage:
#   ./scripts/deploy.sh [OPTIONS]
#
# Options:
#   -b, --bucket      BUCKET_NAME     (required) S3 bucket name
#   -r, --region      REGION          AWS GovCloud region (default: us-gov-west-1)
#   -d, --distribution DIST_ID        CloudFront distribution ID (optional, for invalidation)
#   -p, --profile     AWS_PROFILE     AWS CLI profile to use (optional)
#   -e, --environment ENV             Environment label for logging (default: prod)
#   -y, --yes                         Skip confirmation prompt
#   -h, --help                        Show this help message
#
# Examples:
#   # Basic deploy (S3 only)
#   ./scripts/deploy.sh --bucket my-address-tool-bucket
#
#   # Deploy + CloudFront invalidation
#   ./scripts/deploy.sh --bucket my-address-tool-bucket --distribution E1ABCDEFGHIJKL
#
#   # Use a specific AWS CLI profile
#   ./scripts/deploy.sh --bucket my-address-tool-bucket --profile govcloud-deploy
#
#   # Deploy to GovCloud East
#   ./scripts/deploy.sh --bucket my-address-tool-bucket --region us-gov-east-1
#
# Prerequisites:
#   - AWS CLI v2 installed and configured
#   - Credentials must have s3:PutObject, s3:DeleteObject, s3:ListBucket,
#     and (optional) cloudfront:CreateInvalidation permissions
# =============================================================================
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────
BUCKET=""
REGION="us-gov-west-1"
DISTRIBUTION=""
PROFILE=""
ENVIRONMENT="prod"
SKIP_CONFIRM=false

# ── Script directory ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Color helpers ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()     { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header() { echo -e "\n${CYAN}══════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════${NC}\n"; }

# ── Parse arguments ───────────────────────────────────────────
usage() {
    grep '^#' "$0" | grep -E '^\s*#\s' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -b|--bucket)       BUCKET="$2";       shift 2 ;;
        -r|--region)       REGION="$2";       shift 2 ;;
        -d|--distribution) DISTRIBUTION="$2"; shift 2 ;;
        -p|--profile)      PROFILE="$2";      shift 2 ;;
        -e|--environment)  ENVIRONMENT="$2";  shift 2 ;;
        -y|--yes)          SKIP_CONFIRM=true; shift ;;
        -h|--help)         usage ;;
        *) error "Unknown argument: $1"; exit 1 ;;
    esac
done

# ── Validation ────────────────────────────────────────────────
if [[ -z "$BUCKET" ]]; then
    error "S3 bucket name is required. Use --bucket BUCKET_NAME"
    exit 1
fi

if [[ "$REGION" != "us-gov-west-1" && "$REGION" != "us-gov-east-1" ]]; then
    error "Region must be us-gov-west-1 or us-gov-east-1. Got: $REGION"
    exit 1
fi

# ── Build AWS CLI base command ────────────────────────────────
AWS_CMD="aws"
if [[ -n "$PROFILE" ]]; then
    AWS_CMD="aws --profile $PROFILE"
fi

# ── Check prerequisites ───────────────────────────────────────
header "Prerequisites Check"

if ! command -v aws &>/dev/null; then
    error "AWS CLI not found. Install from: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
fi
ok "AWS CLI found: $(aws --version 2>&1 | head -1)"

# Verify credentials
log "Verifying AWS credentials…"
IDENTITY=$($AWS_CMD sts get-caller-identity --region "$REGION" 2>&1) || {
    error "Could not verify AWS credentials. Check your AWS_PROFILE or environment variables."
    error "Output: $IDENTITY"
    exit 1
}
ACCOUNT_ID=$(echo "$IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])" 2>/dev/null || \
             echo "$IDENTITY" | grep -o '"Account": "[^"]*"' | cut -d'"' -f4)
ok "Authenticated as Account: $ACCOUNT_ID (Region: $REGION)"

# ── Confirm deployment ────────────────────────────────────────
header "Deployment Plan"
log "Site directory:    $SITE_DIR"
log "Target bucket:     s3://$BUCKET"
log "Region:            $REGION"
log "Environment:       $ENVIRONMENT"
[[ -n "$DISTRIBUTION" ]] && log "CloudFront dist:   $DISTRIBUTION"
[[ -n "$PROFILE" ]]      && log "AWS Profile:       $PROFILE"

if [[ "$SKIP_CONFIRM" == "false" ]]; then
    echo ""
    read -r -p "Proceed with deployment? [y/N] " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        warn "Deployment cancelled."
        exit 0
    fi
fi

# ── Files to exclude from upload ─────────────────────────────
EXCLUDES=(
    "--exclude" ".git/*"
    "--exclude" ".github/*"
    "--exclude" "infrastructure/*"
    "--exclude" "scripts/*"
    "--exclude" "*.sh"
    "--exclude" "*.ps1"
    "--exclude" "*.tf"
    "--exclude" "*.tfvars"
    "--exclude" "*.tfstate"
    "--exclude" "*.tfstate.backup"
    "--exclude" ".terraform/*"
    "--exclude" "*.md"
    "--exclude" "node_modules/*"
    "--exclude" ".DS_Store"
    "--exclude" "Thumbs.db"
)

# ── Upload to S3 ──────────────────────────────────────────────
header "Uploading to S3"
log "Syncing site files to s3://$BUCKET …"

$AWS_CMD s3 sync "$SITE_DIR/" "s3://$BUCKET/" \
    --delete \
    --region "$REGION" \
    --cache-control "max-age=3600" \
    --metadata-directive REPLACE \
    "${EXCLUDES[@]}" \
    2>&1

ok "Site files uploaded to s3://$BUCKET"

# Set longer cache on immutable assets (CSS/JS with hashes) if present
log "Setting cache headers on static assets…"
$AWS_CMD s3 cp "s3://$BUCKET/css/" "s3://$BUCKET/css/" \
    --recursive \
    --metadata-directive REPLACE \
    --cache-control "public, max-age=31536000, immutable" \
    --region "$REGION" \
    2>&1 || true

$AWS_CMD s3 cp "s3://$BUCKET/js/" "s3://$BUCKET/js/" \
    --recursive \
    --metadata-directive REPLACE \
    --cache-control "public, max-age=31536000, immutable" \
    --region "$REGION" \
    2>&1 || true

# index.html should not be cached long
$AWS_CMD s3 cp "s3://$BUCKET/index.html" "s3://$BUCKET/index.html" \
    --metadata-directive REPLACE \
    --cache-control "no-cache, no-store, must-revalidate" \
    --region "$REGION" \
    2>&1 || true

# ── CloudFront Invalidation ───────────────────────────────────
if [[ -n "$DISTRIBUTION" ]]; then
    header "CloudFront Cache Invalidation"
    log "Creating invalidation for distribution $DISTRIBUTION …"
    INVALIDATION=$($AWS_CMD cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION" \
        --paths "/*" \
        --region "$REGION" \
        2>&1)
    INV_ID=$(echo "$INVALIDATION" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Invalidation']['Id'])" 2>/dev/null || \
             echo "$INVALIDATION" | grep -o '"Id": "[^"]*"' | head -1 | cut -d'"' -f4)
    ok "Invalidation created: $INV_ID"
    log "Cache will be cleared within ~1-2 minutes."
fi

# ── Summary ───────────────────────────────────────────────────
header "Deployment Complete ✅"
ok "Address Summary Organizing Tool deployed successfully!"
log ""
log "Access your site:"
if [[ -n "$DISTRIBUTION" ]]; then
    CF_DOMAIN=$($AWS_CMD cloudfront get-distribution \
        --id "$DISTRIBUTION" \
        --region "$REGION" \
        --query 'Distribution.DomainName' \
        --output text 2>/dev/null || echo "(check CloudFront console)")
    log "  CloudFront: https://$CF_DOMAIN"
fi
log "  S3 Direct:  https://$BUCKET.s3-website-${REGION}.amazonaws.com"
log ""
