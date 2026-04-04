# USPS Address Management Portal

A full-stack admin portal for managing, validating, and analyzing USPS address data. Runs entirely locally — no external cloud services required.

## What's Included

| Mode | Description | Port |
|------|-------------|------|
| **React App (production)** | Nginx-served production build | `8080` |
| **React App (dev)** | Vite dev server with hot reload | `5173` |
| **Static HTML site** | Original vanilla-JS analysis tool | `8081` |

---

## Quick Start with Docker

> **Requires:** Docker Desktop (or Docker Engine + Compose)

```bash
# Clone / open the project
cd address-summary-organizing-tool

# Start everything
docker compose up --build

# Or start individual services:
docker compose up react-app        # Production React → http://localhost:8080
docker compose up react-dev        # Dev React (hot reload) → http://localhost:5173
docker compose up static-site      # Static HTML tool → http://localhost:8081
```

**Login credentials for the React portal:** `admin` / `usps2024`

Stop all services:

```bash
docker compose down
```

---

## Quick Start without Docker

### React Application

```bash
# Install dependencies
npm install

# Development server (hot reload)
npm run dev
# → http://localhost:5173

# Production build
npm run build
npm run preview
# → http://localhost:4173
```

### Static HTML Site

Open `static-index.html` directly in a browser, or serve it with any static file server:

```bash
npx serve . --listen 8081
# → http://localhost:8081/static-index.html
```

---

## Features

### React Admin Portal (`/src`)

- **Login page** — Session-based auth (localStorage), USPS branding
- **Dashboard** — Statistics cards, address form, interactive Leaflet map, paginated address list
- **My Addresses** — Full CRUD with IndexedDB persistence via LocalForage
- **Upload Data** — Drag-and-drop CSV upload for two datasets, chunked PapaParse streaming, address matching algorithm, AI metrics (Precision, Recall, F1, Accuracy), Chart.js visualizations
- **Settings** — Display preferences, data management, system configuration

### Static Analysis Tool (`static-index.html`)

- Upload two address CSV/Excel files and run a full match analysis
- Geographic breakdowns, data quality metrics, AI metrics
- Export results to CSV and PowerPoint
- No installation needed — works directly in the browser

---

## Project Structure

```
.
├── src/                        # React application source
│   ├── components/
│   │   ├── Auth/               # Login, ProtectedRoute
│   │   ├── Dashboard/          # Overview, AddressDetails, MapView, AddressList, AnalysisDashboard
│   │   ├── Layout/             # Header, Sidebar, Layout
│   │   ├── Settings/           # Settings page
│   │   └── Upload/             # UploadData with CSV parsing
│   ├── hooks/                  # useAuth, useAddresses, useAnalysis
│   ├── services/               # authService, addressService, analysisService
│   ├── utils/                  # constants, formatters
│   ├── workers/                # matcherWorker, analyzerWorker (Web Workers)
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/                     # Static assets
├── docker/
│   ├── nginx.conf              # Nginx config for React production build
│   └── nginx-static.conf       # Nginx config for static HTML site
├── js/                         # Original vanilla-JS engine
│   ├── matcher.js              # Address matching algorithms
│   ├── analyzer.js             # Analysis and AI metrics
│   ├── visualizations.js       # Chart.js chart definitions
│   └── app.js                  # Main application logic
├── css/styles.css              # Static site styles
├── samples/                    # Sample CSV files for testing
├── docs/AI_INTEGRATION_PLAN.md # AI roadmap (local/on-premise approaches)
├── static-index.html           # Original static HTML site
├── index.html                  # Vite entry point (React app)
├── docker-compose.yml          # Multi-service Docker setup
├── Dockerfile                  # React production image (Node build → Nginx)
├── vite.config.js
└── package.json
```

---

## Data Storage

The React portal stores all data client-side:

| Data | Storage |
|------|---------|
| Login session | `localStorage` |
| Addresses | IndexedDB via LocalForage |
| Analysis results | Component state (session only) |

No backend or database is required.

---

## Sample Data

Sample CSV files for testing are in `samples/`:
- `sample_system_a.csv` — System A addresses
- `sample_system_b.csv` — System B addresses

Download links are available on the Upload Data page and in the static HTML tool.

---

## USPS Brand Colors

| Token | Hex |
|-------|-----|
| Navy | `#1B3A6B` |
| Blue | `#004B87` |
| Red | `#E31837` |
| White | `#FFFFFF` |
| Light Gray | `#F5F5F5` |
