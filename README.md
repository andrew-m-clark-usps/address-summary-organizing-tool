# 📊 Address Summary Organizing Tool

A complete, browser-based tool for analyzing and comparing two datasets of address records — with comprehensive chart visualizations, a PowerPoint export, and AWS GovCloud deployment infrastructure.

---

## Features

### Core Capabilities
- **Dual file upload** — CSV and Excel (.xlsx/.xls), up to 55,000+ records per file
- **Smart address matching** — exact matching plus fuzzy matching with Levenshtein distance
- **Address standardization** — Street/St, Avenue/Ave, Road/Rd, Drive/Dr, Boulevard/Blvd, and more
- **Confidence scoring** — 0–100% match score with configurable field weights (ZIP, State, City, Street)
- **Field-by-field comparison** — Street, City, State, ZIP with discrepancy detection
- **No server required** — runs entirely in your browser from the local file system

### 📊 Charts (9 interactive visualizations)
1. **Match Distribution Pie** — Perfect / High / Partial / Low / No Match breakdown
2. **Match Summary Bar** — System A vs B total, matched, unmatched counts
3. **Top States Geographic Chart** — Stacked bar of matched/unmatched by state (top 15)
4. **Match Confidence Histogram** — Distribution of records across confidence ranges
5. **Data Completeness by Field** — System A vs B side-by-side for Street/City/State/ZIP
6. **Address Quality Pie** — Complete vs missing-field breakdown
7. **Top Cities Comparison** — Horizontal bar, System A vs System B (top 10)
8. **Discrepancy Types Donut** — City / State / ZIP / Street mismatch breakdown
9. **Record Volume Comparison** — Matched overlap vs unique records per system

### 📑 PowerPoint Export
Export a complete, professionally formatted **11-slide PowerPoint (.pptx)** presentation:
- Title slide with record counts
- Match Summary statistics with color-coded stat boxes
- All 9 chart images embedded in slides
- Geographic and city tables
- Address quality metrics table
- Discrepancy analysis with counts and percentages
- Key Findings summary slide

### 💾 Data Exports
- Matched records CSV (with confidence scores and discrepancy notes)
- Unmatched System A CSV
- Unmatched System B CSV
- Analysis summary CSV
- Individual chart PNG downloads

### ☁️ AWS GovCloud Infrastructure
- **Terraform** templates for S3 + CloudFront + OAC + security headers + access logging
- **CloudFormation** template (alternative to Terraform)
- **GitHub Actions** CI/CD pipeline for automated GovCloud deployment
- **Deploy scripts** for Linux/macOS (`deploy.sh`) and Windows (`deploy.ps1`)
- **IAM least-privilege policy** for the deploy user
- FedRAMP-aligned security configuration (HTTPS-only, AES-256, security headers)

---

## Running the Tool

### Option 1: Static Website (No Build Required)

Simply open `index.html` in any modern browser, or serve with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node
npx serve .
```

Then open `http://localhost:8000` in your browser.

### Option 2: React Application (Local Development)

```bash
cd react-app
npm install
npm start
```

This launches a full React dev server at `http://localhost:3000` with hot reloading.

To build for production:

```bash
cd react-app
npm run build
```

The built files will be in `react-app/build/` and can be deployed to any static host.

> Both modes deliver the **same** complete functionality: file upload, address matching, analysis dashboard, all charts, AI metrics tab, and export features.

---

## Quick Start (Local / Offline Use)

1. Download or clone this repository
2. Open `index.html` in Chrome, Firefox, or Edge
3. Upload two CSV or Excel address files
4. Click **Run Analysis**
5. Explore the **Dashboard** tab for all charts
6. Export to **PowerPoint** or **CSV** from the Export tab

> **No internet, server, or installation required.**

---

## AWS GovCloud Deployment

See [`infrastructure/README.md`](infrastructure/README.md) for complete deployment instructions.

### Quick deploy with deploy script

```bash
# 1. Provision infrastructure (Terraform)
cd infrastructure/terraform
terraform init && terraform apply

# 2. Deploy site files
./scripts/deploy.sh \
  --bucket  your-bucket-name \
  --distribution E1ABCDEFGHIJKL \
  --region  us-gov-west-1
```

### CI/CD (GitHub Actions)

Push to `main` → auto-deploys to production.  
Push to `develop` → auto-deploys to staging.

Required secrets: `AWS_ACCESS_KEY_ID_GOVCLOUD`, `AWS_SECRET_ACCESS_KEY_GOVCLOUD`,
`S3_BUCKET_PROD`, `CLOUDFRONT_DIST_ID_PROD` (and staging equivalents).

---

## File Format

Expected CSV/Excel columns (auto-detected, case-insensitive):

| Field | Accepted Column Names |
|-------|-----------------------|
| Street | Address, Street, Street Address, Address Line 1, Addr |
| City | City, Town, Municipality |
| State | State, ST, Province, State_Code |
| ZIP | ZIP, ZIP Code, Postal Code, Postal, ZipCode |

Extra columns are preserved in the raw display but do not affect matching.

### Sample files
- `samples/sample_system_a.csv` — 30 Illinois addresses
- `samples/sample_system_b.csv` — 30 Illinois addresses with variations and new records

---

## Understanding Match Scores

| Score | Label | Meaning |
|-------|-------|---------|
| 100% | Perfect | Exact match after standardization |
| 90–99% | High | Very strong match, minor formatting differences |
| 70–89% | Partial | Good match, possible ZIP or city variation |
| 50–69% | Low | Weak match, multiple field differences |
| <50% | No Match | Records treated as unmatched |

**Scoring weights (configurable in Upload tab):**
- ZIP code: 40% · State: 30% · City: 20% · Street: 10%

---

## Technology Stack

| Library | Version | Purpose |
|---------|---------|---------|
| [Papa Parse](https://www.papaparse.com/) | 5.4.1 | CSV parsing |
| [SheetJS (xlsx)](https://sheetjs.com/) | 0.18.5 | Excel file reading |
| [Chart.js](https://www.chartjs.org/) | 4.4.3 | Interactive chart visualizations |
| [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 3.12.0 | PowerPoint generation |

All libraries load from CDN. No build step required.

---

## File Structure

```
/
├── index.html                    Static site entry point (no build required)
├── css/
│   └── styles.css                Styles for the static site
├── js/
│   ├── app.js                    Core logic, CSV/PPTX export, UI state
│   ├── matcher.js                Address matching engine (exact + fuzzy)
│   ├── analyzer.js               Data analysis functions
│   └── visualizations.js        Chart.js chart rendering (9 charts)
├── samples/
│   ├── sample_system_a.csv       30 sample System A records
│   └── sample_system_b.csv       30 sample System B records
├── react-app/                    React application (same functionality)
│   ├── package.json              npm dependencies
│   ├── public/
│   │   ├── index.html            React app HTML shell
│   │   └── samples/              Sample files for React app
│   ├── src/
│   │   ├── App.jsx               Root component
│   │   ├── engine/               ES module ports of matcher/analyzer
│   │   ├── context/              Global state management (React Context)
│   │   ├── components/           UI components and charts
│   │   ├── utils/                File parsing, CSV/PPTX export utilities
│   │   └── styles/               Ported CSS
│   └── README.md                 React app setup instructions
├── infrastructure/
│   ├── terraform/                Terraform IaC for AWS GovCloud
│   ├── cloudformation/           CloudFormation alternative
│   ├── iam-deploy-policy.json    Minimum IAM permissions for CI/CD
│   └── README.md                 Infrastructure deployment guide
├── scripts/
│   ├── deploy.sh                 Linux/macOS deploy script
│   └── deploy.ps1                Windows PowerShell deploy script
└── .github/workflows/
    └── deploy.yml                GitHub Actions CI/CD pipeline
```

---

## Browser Requirements

Chrome 90+, Firefox 88+, Edge 90+, Safari 14+ recommended.  
Internet Explorer is not supported.

---

## Performance Notes

- Processing 55,000 records typically completes in 5–20 seconds depending on browser and hardware
- Chart rendering completes within 2–3 seconds after analysis
- All processing runs client-side; no data is sent to any server

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Charts not rendering | Ensure you have run analysis first; check browser console for errors |
| File won't load | Verify the file is valid CSV or .xlsx/.xls and has address-related column names |
| PowerPoint export empty | Run analysis completely before exporting; charts must be rendered |
| Slow on large files | Use Chrome for best performance; close other tabs |
| Column not detected | Rename columns to match expected names (see File Format section) |
| CDN libraries fail | Host the tool on S3/CloudFront for a reliable CDN-accessible environment |

---

## License

MIT — See [LICENSE](LICENSE) for details.
