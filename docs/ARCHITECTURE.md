# USPS Address Management Portal — Architecture

## Overview

A single-page React 18 application that runs entirely in the browser. No backend server or external API is required. All data is stored locally in the user's browser via IndexedDB. Each user sees only their own address records.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  React 18 SPA (Vite)                     │   │
│  │                                                          │   │
│  │  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐   │   │
│  │  │  TopNav  │  │   Routing   │  │  Protected Route │   │   │
│  │  │ (sticky) │  │ react-router│  │  (auth guard)    │   │   │
│  │  └──────────┘  └─────────────┘  └──────────────────┘   │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │                   Pages                         │    │   │
│  │  │  /dashboard  — Portal (Entry Table + Upload)    │    │   │
│  │  │  /addresses  — Address Management + Map         │    │   │
│  │  │  /review     — Internal Review Queue            │    │   │
│  │  │  /settings   — User Preferences                 │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │   │
│  │  │   Services   │  │  Web Workers  │  │    Hooks    │  │   │
│  │  │ addressSvc   │  │ matcherWorker │  │ useAddresses│  │   │
│  │  │ authService  │  │analyzerWorker │  │ useAuth     │  │   │
│  │  │ analysisSvc  │  └───────────────┘  │ useAnalysis │  │   │
│  │  └──────┬───────┘                     └─────────────┘  │   │
│  │         │                                               │   │
│  │  ┌──────▼────────────────────────────────────────┐     │   │
│  │  │              Storage Layer                    │     │   │
│  │  │  IndexedDB (localForage) — user-scoped keys   │     │   │
│  │  │  localStorage — auth session only             │     │   │
│  │  └───────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  External (read-only, tiles only):                              │
│  OpenStreetMap tile server ──► Leaflet map rendering            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page & Component Map

| Route | Page | Key Components |
|-------|------|----------------|
| `/login` | Login | `Login.jsx` |
| `/dashboard` | Enterprise Services | `PortalHeader`, `GetStarted`, `AddressEntryTable`, `FileUploadSection` |
| `/addresses` | Address Management | `AddressManagement`, `MapView`, address table, CRUD form |
| `/review` | Internal Review Queue | `ReviewQueue`, status filter, approve/reject actions |
| `/settings` | Settings | `Settings`, account info, preferences, storage |

---

## Data Flow

```
User Action
    │
    ▼
React Component  ──► Custom Hook (useAddresses / useAnalysis)
    │                       │
    │                       ▼
    │               Service Layer
    │               ├─ addressService.js  ──► IndexedDB (per-user key)
    │               ├─ authService.js     ──► localStorage
    │               └─ analysisService.js ──► in-memory computation
    │
    ▼
Web Worker (for heavy computation — matching, metrics)
    └─ matcherWorker.js
    └─ analyzerWorker.js
```

---

## User Data Isolation

Every record written to IndexedDB is keyed by username:

```
records_admin   ← only visible when logged in as "admin"
records_jsmith  ← only visible when logged in as "jsmith"
```

No user can read or modify another user's data.

---

## Authentication

- Credentials validated in `authService.js` (client-side for demo)
- Session stored in `localStorage` as JSON (`usps_session` key)
- All routes except `/login` are wrapped in `ProtectedRoute` — unauthenticated users are redirected to `/login`
- Logout clears the session key and redirects to `/login`

---

## Technology Stack

| Concern | Library | Version |
|---------|---------|---------|
| UI framework | React | 18 |
| Build tool | Vite | 8 |
| Routing | react-router-dom | 7 |
| Maps | Leaflet + react-leaflet | 1.9 / 5 |
| Charts | Chart.js + react-chartjs-2 | 4 / 5 |
| CSV parsing | PapaParse | 5 |
| Excel parsing | **exceljs** (replaces xlsx — security) | 4 |
| Client storage | localForage (IndexedDB) | 1.10 |
| Containerization | Docker + Nginx | alpine |

> **Note:** `xlsx` was removed due to two unpatched vulnerabilities (ReDoS CVE + Prototype Pollution). Replaced with `exceljs`.

---

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `react-app` | 8080 | Production Nginx build |
| `react-dev` | 5173 | Vite dev server (hot reload) |
| `static-site` | 8081 | Original static HTML analysis tool |

```bash
docker compose up --build          # all services
docker compose up react-app        # production only → http://localhost:8080
docker compose up react-dev        # dev only → http://localhost:5173
docker compose up static-site      # static HTML → http://localhost:8081
```

---

## File Structure

```
src/
├── components/
│   ├── Auth/           Login, ProtectedRoute
│   ├── Dashboard/      AddressManagement, MapView (Leaflet)
│   ├── Icons/          SVG icon library
│   ├── Layout/         TopNav, Layout wrapper
│   ├── Portal/         PortalHeader, GetStarted, AddressEntryTable, FileUploadSection
│   ├── ReviewQueue/    ReviewQueue
│   ├── Settings/       Settings
│   └── Upload/         UploadData (legacy)
├── hooks/              useAuth, useAddresses, useAnalysis
├── services/           authService, addressService, analysisService
├── workers/            matcherWorker, analyzerWorker
├── utils/              constants, formatters
├── App.jsx             Routes
├── main.jsx            Entry point
└── index.css           USPS design system
```

---

## Security Notes

- No address data is ever sent to any external server
- Map tiles are fetched from OpenStreetMap (lat/lon coordinates only, no PII)
- Demo credentials (`admin`/`usps2024`) are hardcoded for local use — replace with a real auth backend for production
- `xlsx` dependency removed due to ReDoS + Prototype Pollution vulnerabilities; replaced with `exceljs`
