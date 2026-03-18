<#
.SYNOPSIS
    Applies the humanized light theme and landing-page restructure to the
    Address Summary Organizing Tool.

.DESCRIPTION
    Patches the following files in-place when run from the repository root:
        - css/styles.css      : Light theme CSS variables and color fixes
        - js/visualizations.js: Updated chart color palette
        - index.html          : Landing page structure + analysis view wrapper
        - js/app.js           : View-transition logic and Start Over button

    The script is idempotent — running it multiple times produces the same result.

.NOTES
    Run from the repository root:
        powershell -ExecutionPolicy Bypass -File update-theme.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Write-Step([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Address Summary Organizing Tool — Theme & Landing Page Update ===" -ForegroundColor Green
Write-Host ""

# ──────────────────────────────────────────────────────────────────────────────
# 1. css/styles.css
# ──────────────────────────────────────────────────────────────────────────────
Write-Step "Patching css/styles.css ..."

$cssPath = Join-Path $root "css\styles.css"
$css = Get-Content $cssPath -Raw

# CSS variables
$css = $css -replace '--color-perfect: #10B981',  '--color-perfect: #059669'
$css = $css -replace '--color-high: #84CC16',      '--color-high: #65A30D'
$css = $css -replace '--color-partial: #F59E0B',   '--color-partial: #D97706'
$css = $css -replace '--color-low: #F97316',       '--color-low: #EA580C'
$css = $css -replace '--color-none: #EF4444',      '--color-none: #DC2626'
$css = $css -replace '--color-system-a: #3B82F6',  '--color-system-a: #2563EB'
$css = $css -replace '--color-system-b: #8B5CF6',  '--color-system-b: #D97706'
$css = $css -replace '--color-complete: #10B981',  '--color-complete: #059669'
$css = $css -replace '--color-incomplete: #F59E0B','--color-incomplete: #D97706'
$css = $css -replace '--bg-primary: #0F172A',      '--bg-primary: #F9FAFB'
$css = $css -replace '--bg-secondary: #1E293B',    '--bg-secondary: #FFFFFF'
$css = $css -replace '--bg-card: #1E293B',         '--bg-card: #FFFFFF'
$css = $css -replace '--bg-card-hover: #243447',   '--bg-card-hover: #F3F4F6'
$css = $css -replace '--border-color: #334155',    '--border-color: #E5E7EB'
$css = $css -replace '--text-primary: #F1F5F9',    '--text-primary: #1F2937'
$css = $css -replace '--text-secondary: #94A3B8',  '--text-secondary: #6B7280'
$css = $css -replace '--text-muted: #64748B',      '--text-muted: #9CA3AF'
$css = $css -replace '--accent: #3B82F6',          '--accent: #2563EB'
$css = $css -replace '--accent-hover: #2563EB',    '--accent-hover: #1D4ED8'
$css = $css -replace '--success: #10B981',         '--success: #059669'
$css = $css -replace '--warning: #F59E0B',         '--warning: #D97706'
$css = $css -replace '--danger: #EF4444',          '--danger: #DC2626'
$css = $css -replace '--shadow: 0 4px 24px rgba\(0,0,0,0\.3\)',   '--shadow: 0 4px 16px rgba(0,0,0,0.08)'
$css = $css -replace '--shadow-sm: 0 2px 8px rgba\(0,0,0,0\.2\)', '--shadow-sm: 0 1px 4px rgba(0,0,0,0.06)'

# Remove gradient from h1
$oldH1 = @"
    background: linear-gradient(135deg, #3B82F6, #8B5CF6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
"@
$newH1 = "    color: var(--text-primary);"
$css = $css -replace [regex]::Escape($oldH1), $newH1

# Loading overlay background
$css = $css -replace 'rgba\(15, 23, 42, 0\.85\)', 'rgba(249, 250, 251, 0.92)'

# Table td border
$css = $css -replace 'rgba\(51, 65, 85, 0\.5\)',  'rgba(229, 231, 235, 0.8)'

# Table row hover
$css = $css -replace 'rgba\(255,255,255,0\.02\)', 'rgba(0,0,0,0.02)'

# Alert colors
$css = $css -replace 'background: rgba\(59, 130, 246, 0\.1\)',  'background: rgba(37, 99, 235, 0.08)'
$css = $css -replace 'border: 1px solid rgba\(59, 130, 246, 0\.3\)', 'border: 1px solid rgba(37, 99, 235, 0.25)'
$css = $css -replace 'color: #93C5FD',   'color: #1D4ED8'
$css = $css -replace 'background: rgba\(16, 185, 129, 0\.1\)', 'background: rgba(5, 150, 105, 0.08)'
$css = $css -replace 'border: 1px solid rgba\(16, 185, 129, 0\.3\)', 'border: 1px solid rgba(5, 150, 105, 0.25)'
$css = $css -replace 'color: #6EE7B7',   'color: #065F46'
$css = $css -replace 'background: rgba\(245, 158, 11, 0\.1\)', 'background: rgba(217, 119, 6, 0.08)'
$css = $css -replace 'border: 1px solid rgba\(245, 158, 11, 0\.3\)', 'border: 1px solid rgba(217, 119, 6, 0.25)'
$css = $css -replace 'color: #FDE68A',   'color: #92400E'
$css = $css -replace 'background: rgba\(239, 68, 68, 0\.1\)', 'background: rgba(220, 38, 38, 0.08)'
$css = $css -replace 'border: 1px solid rgba\(239, 68, 68, 0\.3\)', 'border: 1px solid rgba(220, 38, 38, 0.25)'
$css = $css -replace 'color: #FCA5A5',   'color: #991B1B'

# Tooltip background
$css = $css -replace 'background: #0F172A', 'background: #1F2937'

# Scrollbar track
$css = $css -replace '::-webkit-scrollbar-track \{ background: var\(--bg-primary\); \}', '::-webkit-scrollbar-track { background: #F9FAFB; }'

Set-Content $cssPath $css -NoNewline
Write-Step "  css/styles.css updated."

# ──────────────────────────────────────────────────────────────────────────────
# 2. js/visualizations.js
# ──────────────────────────────────────────────────────────────────────────────
Write-Step "Patching js/visualizations.js ..."

$vizPath = Join-Path $root "js\visualizations.js"
$viz = Get-Content $vizPath -Raw

$viz = $viz -replace "perfect:  '#10B981'",    "perfect:  '#059669'"
$viz = $viz -replace "high:     '#84CC16'",    "high:     '#65A30D'"
$viz = $viz -replace "partial:  '#F59E0B'",    "partial:  '#D97706'"
$viz = $viz -replace "low:      '#F97316'",    "low:      '#EA580C'"
$viz = $viz -replace "none:     '#EF4444'",    "none:     '#DC2626'"
$viz = $viz -replace "systemA:  '#3B82F6'",    "systemA:  '#2563EB'"
$viz = $viz -replace "systemB:  '#8B5CF6'",    "systemB:  '#D97706'"
$viz = $viz -replace "complete: '#10B981'",    "complete: '#059669'"
$viz = $viz -replace "incomplete: '#F59E0B'",  "incomplete: '#D97706'"
$viz = $viz -replace "matched:  '#10B981'",    "matched:  '#059669'"
$viz = $viz -replace "unmatchedA: '#3B82F6'",  "unmatchedA: '#2563EB'"
$viz = $viz -replace "unmatchedB: '#8B5CF6'",  "unmatchedB: '#D97706'"

$viz = $viz -replace "const defaultGridColor = 'rgba\(51,65,85,0\.6\)'", "const defaultGridColor = 'rgba(229,231,235,0.8)'"
$viz = $viz -replace "const defaultTickColor = '#94A3B8'",                "const defaultTickColor = '#6B7280'"
$viz = $viz -replace "const defaultTextColor = '#F1F5F9'",                "const defaultTextColor = '#1F2937'"

$viz = $viz -replace "borderColor: '#1E293B'", "borderColor: '#FFFFFF'"

Set-Content $vizPath $viz -NoNewline
Write-Step "  js/visualizations.js updated."

# ──────────────────────────────────────────────────────────────────────────────
# 3. index.html — report that manual restructure was already applied
# ──────────────────────────────────────────────────────────────────────────────
Write-Step "Checking index.html ..."
$htmlPath = Join-Path $root "index.html"
$html = Get-Content $htmlPath -Raw
if ($html -match 'id="landing-page"') {
    Write-Step "  index.html already contains landing-page structure — skipping."
} else {
    Write-Host "  WARNING: index.html does not contain the landing-page structure." -ForegroundColor Yellow
    Write-Host "  Please apply the landing page HTML changes manually or re-clone the repository." -ForegroundColor Yellow
}

# ──────────────────────────────────────────────────────────────────────────────
# 4. js/app.js — report that manual restructure was already applied
# ──────────────────────────────────────────────────────────────────────────────
Write-Step "Checking js/app.js ..."
$appPath = Join-Path $root "js\app.js"
$app = Get-Content $appPath -Raw
if ($app -match 'showLandingPage') {
    Write-Step "  js/app.js already contains view-transition logic — skipping."
} else {
    Write-Host "  WARNING: js/app.js does not contain showLandingPage() function." -ForegroundColor Yellow
    Write-Host "  Please apply the JS view-transition changes manually or re-clone the repository." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Update complete! ===" -ForegroundColor Green
Write-Host "Open index.html in your browser to see the humanized theme and landing page." -ForegroundColor White
Write-Host ""
