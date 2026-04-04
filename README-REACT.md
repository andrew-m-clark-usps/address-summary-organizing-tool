# USPS Address Management Portal — React Application

A complete React 18 admin portal built with Vite for managing USPS addresses.

## Getting Started

### Prerequisites

- Node.js 18+ and npm (for running without Docker)
- Docker Desktop (for Docker-based running)

### Run with Docker (recommended)

```bash
# Production (React app built and served by Nginx)
docker compose up react-app --build
# → http://localhost:8080

# Development (Vite dev server with hot module reload)
docker compose up react-dev --build
# → http://localhost:5173

# Static HTML site alongside React
docker compose up static-site --build
# → http://localhost:8081
```

Stop services:
```bash
docker compose down
```

### Run without Docker

```bash
npm install
npm run dev        # → http://localhost:5173
```

**Login:** `admin` / `usps2024`

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview the production build |

---

## Tech Stack

- **React 18** — Functional components and hooks
- **Vite** — Fast build tool and dev server
- **React Router v6** — Client-side routing
- **Leaflet + react-leaflet** — Interactive maps (OpenStreetMap, no API key)
- **Chart.js + react-chartjs-2** — Data visualizations
- **PapaParse** — CSV parsing with chunked streaming for large files
- **LocalForage** — IndexedDB storage for address persistence
- **XLSX** — Excel file support

---

## Application Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | → `/login` | Redirect |
| `/login` | Login | USPS-branded login form |
| `/dashboard` | Dashboard | Stats cards + address form + map + list |
| `/addresses` | My Addresses | CRUD for addresses |
| `/upload` | Upload Data | CSV upload + analysis + AI metrics |
| `/settings` | Settings | Configuration panel |

---

## Project Structure

```
src/
├── components/
│   ├── Auth/
│   │   ├── Login.jsx           USPS-branded login page
│   │   └── ProtectedRoute.jsx  Auth guard for routes
│   ├── Dashboard/
│   │   ├── DashboardOverview.jsx   4 stat cards
│   │   ├── AddressDetails.jsx      Address form with all fields
│   │   ├── MapView.jsx             Leaflet map with marker
│   │   ├── AddressList.jsx         Paginated address table
│   │   └── AnalysisDashboard.jsx   Charts + AI metrics
│   ├── Layout/
│   │   ├── Header.jsx          Sticky USPS header
│   │   ├── Sidebar.jsx         Left nav with active states
│   │   └── Layout.jsx          Wrapper combining header + sidebar
│   ├── Upload/
│   │   └── UploadData.jsx      Drag-and-drop + PapaParse + analysis
│   └── Settings/
│       └── Settings.jsx        Preferences configuration
├── hooks/
│   ├── useAuth.js              Login/logout/session
│   ├── useAddresses.js         CRUD + pagination
│   └── useAnalysis.js          Run analysis workflow
├── services/
│   ├── authService.js          localStorage session management
│   ├── addressService.js       LocalForage IndexedDB CRUD
│   └── analysisService.js      Address matching + AI metrics
├── workers/
│   ├── matcherWorker.js        Web Worker for background matching
│   └── analyzerWorker.js       Web Worker for background metrics
├── utils/
│   ├── constants.js            USPS colors, sample data, US states
│   └── formatters.js           Number/percent/lat-lon formatters
├── App.jsx                     Router + page components
├── main.jsx                    React entry point
└── index.css                   USPS brand CSS variables + global styles
```

---

## Data Storage

All data is stored client-side:

- **Session** — `localStorage` (key: `usps_session`)
- **Addresses** — IndexedDB via LocalForage (store: `usps_addresses`)
- **First load** — Auto-seeded with 3 sample addresses

---

## Address Analysis Algorithm

The Upload Data page matches two CSV datasets using:

| Component | Weight |
|-----------|--------|
| ZIP code (first 5 digits) | 30% |
| Street name (Levenshtein) | 30% |
| City (exact match) | 20% |
| State (exact match) | 20% |

Match threshold: **70%** (configurable in Settings)

AI metrics computed after analysis:
- **Precision** — matched / (matched + false positives estimate)
- **Recall** — matched / (matched + unmatched)
- **F1 Score** — harmonic mean of precision and recall
- **Accuracy** — matched / total records
- **Average Match Score** — mean of all pair scores above threshold
