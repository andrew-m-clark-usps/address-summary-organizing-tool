# USPS Address Management Portal - React Application

This is a complete React 18 application built with Vite for managing USPS addresses.

## Features

- **Authentication System**: Secure login with protected routes (admin/usps2024)
- **Dashboard**: Overview with statistics cards and address management
- **Address Management**: CRUD operations with IndexedDB persistence
- **Interactive Map**: Leaflet integration showing address locations
- **Data Upload & Analysis**: CSV upload with similarity matching and AI metrics
- **Settings**: Customizable preferences and configurations
- **Responsive Design**: USPS-branded UI with clean layout

## Technology Stack

- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and dev server
- **React Router v6**: Client-side routing
- **Leaflet**: Interactive maps
- **Chart.js**: Data visualizations
- **PapaParse**: CSV parsing with chunked streaming
- **LocalForage**: IndexedDB storage
- **XLSX**: Excel file support

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
# or
npm start
```

Visit http://localhost:5173

### Build for Production

```bash
npm run build
```

The build output will be in `dist/`

### Preview Production Build

```bash
npm run preview
```

## Docker

### Development with Docker Compose

```bash
docker-compose up dev
```

Visit http://localhost:3000

### Production with Docker

```bash
# Build and run
docker-compose up app

# Or build manually
docker build -t usps-portal .
docker run -p 8080:80 usps-portal
```

Visit http://localhost:8080

## Project Structure

```
src/
├── components/
│   ├── Layout/          # Header, Sidebar, Layout wrapper
│   ├── Dashboard/       # Dashboard components
│   ├── Auth/            # Login and ProtectedRoute
│   ├── Upload/          # Data upload and analysis
│   └── Settings/        # Settings page
├── workers/             # Web Workers for background processing
├── services/            # Business logic and APIs
├── hooks/               # Custom React hooks
├── utils/               # Constants and formatters
├── App.jsx              # Main app with routing
├── main.jsx             # React entry point
└── index.css            # Global styles
```

## Features Overview

### 1. Login Page
- Credentials: admin / usps2024
- Session persistence in localStorage
- Protected route system

### 2. Dashboard
- 4 statistics cards (Total, Pending, Verified, Issues)
- Address details form with validation
- Interactive Leaflet map
- Paginated address list

### 3. My Addresses
- Full CRUD operations
- State dropdown with all US states
- Residential/Commercial/Active flags
- Real-time updates

### 4. Upload Data
- Drag-and-drop CSV upload for 2 datasets
- Chunked parsing for large files
- Address matching algorithm with similarity scoring
- AI metrics: Precision, Recall, F1, Accuracy
- Chart.js visualizations (Doughnut and Bar charts)

### 5. Settings
- Account management
- Display preferences
- Data management options
- System configuration

## Data Storage

- Uses IndexedDB via LocalForage for client-side persistence
- Auto-seeds with sample data on first load
- All CRUD operations persist across sessions

## Analysis Algorithm

The address matching uses:
- State matching (20% weight)
- City matching (20% weight)
- ZIP code matching (30% weight)
- Street Levenshtein distance (30% weight)
- Threshold: 70% similarity

AI metrics computed:
- Precision, Recall, F1 Score
- Accuracy and Average Match Score
- False Positive/Negative estimates

## Original Static Site

The original static HTML site has been preserved as `static-index.html` for reference.

## License

USPS Address Management Portal
