<#
.SYNOPSIS
    Deploy Address Summary Organizing Tool to AWS GovCloud S3.

.DESCRIPTION
    Syncs static site files to an S3 bucket, optionally invalidates CloudFront cache.
    Targets AWS GovCloud (us-gov-west-1 or us-gov-east-1).

.PARAMETER BucketName
    (Required) The S3 bucket name to deploy to.

.PARAMETER Region
    AWS GovCloud region. Default: us-gov-west-1

.PARAMETER DistributionId
    CloudFront distribution ID for cache invalidation (optional).

.PARAMETER Profile
    AWS CLI profile name (optional).

.PARAMETER Environment
    Deployment environment label (dev/staging/prod). Default: prod

.PARAMETER SkipConfirm
    Skip the confirmation prompt.

.EXAMPLE
    .\scripts\deploy.ps1 -BucketName "my-address-tool-bucket"

.EXAMPLE
    .\scripts\deploy.ps1 -BucketName "my-address-tool-bucket" `
                         -DistributionId "E1ABCDEFGHIJKL" `
                         -Profile "govcloud-deploy"

.EXAMPLE
    .\scripts\deploy.ps1 -BucketName "my-address-tool-bucket" `
                         -Region "us-gov-east-1" `
                         -SkipConfirm
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [string]$BucketName,

    [Parameter(Mandatory = $false)]
    [ValidateSet("us-gov-west-1", "us-gov-east-1")]
    [string]$Region = "us-gov-west-1",

    [Parameter(Mandatory = $false)]
    [string]$DistributionId = "",

    [Parameter(Mandatory = $false)]
    [string]$Profile = "",

    [Parameter(Mandatory = $false)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment = "prod",

    [Parameter(Mandatory = $false)]
    [switch]$SkipConfirm
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ───────────────────────────────────────────────────
function Write-Header([string]$msg) {
    Write-Host ""
    Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}
function Log-Info([string]$msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Blue }
function Log-Ok([string]$msg)    { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Log-Warn([string]$msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Log-Error([string]$msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ── Build AWS CLI args list ────────────────────────────────────
$AwsBaseArgs = @("--region", $Region)
if ($Profile -ne "") {
    $AwsBaseArgs += @("--profile", $Profile)
}

# ── Script paths ──────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SiteDir   = Resolve-Path (Join-Path $ScriptDir "..")

# ── Prerequisites ─────────────────────────────────────────────
Write-Header "Prerequisites Check"

if (-not (Get-Command "aws" -ErrorAction SilentlyContinue)) {
    Log-Error "AWS CLI not found. Install from: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
}
$AwsVersion = & aws --version 2>&1
Log-Ok "AWS CLI found: $AwsVersion"

Log-Info "Verifying AWS credentials..."
try {
    $IdentityJson = & aws sts get-caller-identity @AwsBaseArgs 2>&1 | Out-String
    $Identity     = $IdentityJson | ConvertFrom-Json
    Log-Ok "Authenticated as Account: $($Identity.Account) (Region: $Region)"
} catch {
    Log-Error "Could not verify AWS credentials. Check your AWS profile or environment variables."
    Log-Error $_.Exception.Message
    exit 1
}

# ── Confirm deployment ────────────────────────────────────────
Write-Header "Deployment Plan"
Log-Info "Site directory:  $SiteDir"
Log-Info "Target bucket:   s3://$BucketName"
Log-Info "Region:          $Region"
Log-Info "Environment:     $Environment"
if ($DistributionId -ne "") { Log-Info "CloudFront dist: $DistributionId" }
if ($Profile -ne "")        { Log-Info "AWS Profile:     $Profile" }

if (-not $SkipConfirm) {
    Write-Host ""
    $Confirm = Read-Host "Proceed with deployment? [y/N]"
    if ($Confirm -notmatch "^[Yy]$") {
        Log-Warn "Deployment cancelled."
        exit 0
    }
}

# ── Exclusion patterns ────────────────────────────────────────
$ExcludeArgs = @(
    "--exclude", ".git/*",
    "--exclude", ".github/*",
    "--exclude", "infrastructure/*",
    "--exclude", "scripts/*",
    "--exclude", "*.sh",
    "--exclude", "*.ps1",
    "--exclude", "*.tf",
    "--exclude", "*.tfvars",
    "--exclude", "*.tfstate",
    "--exclude", "*.tfstate.backup",
    "--exclude", ".terraform/*",
    "--exclude", "*.md",
    "--exclude", "node_modules/*",
    "--exclude", ".DS_Store",
    "--exclude", "Thumbs.db"
)

# ── Upload to S3 ──────────────────────────────────────────────
Write-Header "Uploading to S3"
Log-Info "Syncing site files to s3://$BucketName ..."

$SyncArgs = @(
    "s3", "sync", "$SiteDir/", "s3://$BucketName/",
    "--delete",
    "--cache-control", "max-age=3600",
    "--metadata-directive", "REPLACE"
) + $AwsBaseArgs + $ExcludeArgs

& aws @SyncArgs
if ($LASTEXITCODE -ne 0) {
    Log-Error "S3 sync failed."
    exit $LASTEXITCODE
}
Log-Ok "Site files uploaded to s3://$BucketName"

# Set immutable cache on CSS/JS assets
Log-Info "Setting long-term cache headers on static assets..."
$StaticArgs = @(
    "s3", "cp", "s3://$BucketName/css/", "s3://$BucketName/css/",
    "--recursive",
    "--metadata-directive", "REPLACE",
    "--cache-control", "public, max-age=31536000, immutable"
) + $AwsBaseArgs

& aws @StaticArgs 2>$null; $true   # non-fatal

$JsArgs = @(
    "s3", "cp", "s3://$BucketName/js/", "s3://$BucketName/js/",
    "--recursive",
    "--metadata-directive", "REPLACE",
    "--cache-control", "public, max-age=31536000, immutable"
) + $AwsBaseArgs

& aws @JsArgs 2>$null; $true   # non-fatal

# index.html — no cache
$IndexArgs = @(
    "s3", "cp", "s3://$BucketName/index.html", "s3://$BucketName/index.html",
    "--metadata-directive", "REPLACE",
    "--cache-control", "no-cache, no-store, must-revalidate"
) + $AwsBaseArgs

& aws @IndexArgs 2>$null; $true

# ── CloudFront Invalidation ───────────────────────────────────
if ($DistributionId -ne "") {
    Write-Header "CloudFront Cache Invalidation"
    Log-Info "Creating invalidation for distribution $DistributionId ..."

    $InvArgs = @(
        "cloudfront", "create-invalidation",
        "--distribution-id", $DistributionId,
        "--paths", "/*"
    ) + $AwsBaseArgs

    $InvJson = & aws @InvArgs 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Log-Warn "CloudFront invalidation failed (site is still deployed)."
        Log-Warn $InvJson
    } else {
        $Inv = $InvJson | ConvertFrom-Json
        Log-Ok "Invalidation created: $($Inv.Invalidation.Id)"
        Log-Info "Cache will be cleared within ~1-2 minutes."
    }
}

# ── Summary ───────────────────────────────────────────────────
Write-Header "Deployment Complete"
Log-Ok "Address Summary Organizing Tool deployed successfully!"
Log-Info ""
Log-Info "Access your site:"
if ($DistributionId -ne "") {
    try {
        $CfDomainJson = & aws cloudfront get-distribution --id $DistributionId @AwsBaseArgs `
            --query "Distribution.DomainName" --output text 2>&1 | Out-String
        Log-Info "  CloudFront: https://$($CfDomainJson.Trim())"
    } catch {
        Log-Info "  CloudFront: (check CloudFront console)"
    }
}
Log-Info "  S3 Direct:  https://$BucketName.s3-website-${Region}.amazonaws.com"
