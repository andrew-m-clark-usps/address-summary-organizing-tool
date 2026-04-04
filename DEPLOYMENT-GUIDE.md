# USPS Address Management Portal — Local Deployment Guide

This guide covers running the portal locally using Docker or Node.js directly.

---

## Option 1: Docker Compose (All Services)

> **Requires:** Docker Desktop or Docker Engine + Docker Compose v2

Start all three services at once:

```bash
docker compose up --build
```

| Service | URL | Description |
|---------|-----|-------------|
| `react-app` | http://localhost:8080 | React portal (production Nginx build) |
| `react-dev` | http://localhost:5173 | React portal (Vite dev server, hot reload) |
| `static-site` | http://localhost:8081 | Original static HTML analysis tool |

Stop all services:

```bash
docker compose down
```

Start individual services:

```bash
docker compose up react-app    # Production React only
docker compose up react-dev    # Dev React only
docker compose up static-site  # Static HTML only
```

Rebuild after code changes:

```bash
docker compose up react-app --build
```

---

## Option 2: Node.js (React App without Docker)

```bash
# Install dependencies
npm install

# Development server (hot reload)
npm run dev
# → http://localhost:5173

# Production build
npm run build

# Preview production build
npm run preview
# → http://localhost:4173
```

---

## Option 3: Static HTML Site without Docker

The static HTML analysis tool (`static-index.html`) works with any static file server or directly in a browser.

**Open directly in browser:**
```bash
# macOS
open static-index.html

# Linux
xdg-open static-index.html

# Windows
start static-index.html
```

**Serve with Node.js:**
```bash
npx serve . --listen 8081
# → http://localhost:8081/static-index.html
```

**Serve with Python:**
```bash
python3 -m http.server 8081
# → http://localhost:8081/static-index.html
```

---

## Docker Configuration Details

### `Dockerfile` (React production)
Multi-stage build:
1. **Build stage** (`node:20-alpine`) — installs npm dependencies, runs `npm run build`
2. **Production stage** (`nginx:alpine`) — serves `dist/` with the Nginx SPA config

### `docker-compose.yml` services

```
react-app     → Dockerfile multi-stage → nginx on port 8080
react-dev     → node:20-alpine + volume mount → vite on port 5173
static-site   → nginx:alpine + volume mount → serves static-index.html on port 8081
```

### `docker/nginx.conf` (React production)
- SPA routing: `try_files $uri $uri/ /index.html`
- Gzip compression enabled
- Static asset caching headers

### `docker/nginx-static.conf` (Static HTML)
- Serves the project root directory
- No SPA rewrite needed

---

## React App Login

Default credentials (stored in `src/services/authService.js`):

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `usps2024` |

Session is stored in `localStorage` and persists across page refreshes until logout.

---

## Troubleshooting

**Port already in use:**
```bash
# Check what's using the port
lsof -i :8080

# Change the port in docker-compose.yml:
ports:
  - "9080:80"    # change left side only
```

**Docker build fails:**
```bash
# Clear Docker build cache
docker compose build --no-cache

# Or remove all stopped containers and images
docker system prune
```

**Node modules error in dev container:**
```bash
# Remove and recreate named volumes
docker compose down -v
docker compose up react-dev --build
```

**Map not showing:**
Leaflet loads tiles from OpenStreetMap — requires internet access. On a fully air-gapped machine, configure a local tile server (e.g., TileServer GL with MBTiles).

---

## Production Hardening (on-premise server)

For deploying on a local server (VM, on-premise host):

1. **Change credentials** in `src/services/authService.js` — or add a proper backend auth layer.
2. **Add HTTPS** — use a reverse proxy (e.g., Nginx) with a self-signed or internal CA certificate.
3. **Restrict network access** — bind Docker ports to `127.0.0.1` if the server should only be accessible locally.

```yaml
# docker-compose.yml — restrict to localhost only
ports:
  - "127.0.0.1:8080:80"
```
