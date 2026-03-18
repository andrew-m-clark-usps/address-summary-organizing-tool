# Testing Checklist for USPS Address Management Portal

## ✅ Pre-deployment Testing

### 1. Build Verification
- [x] `npm run build` completes successfully
- [x] No blocking errors in build output
- [x] dist/ folder created with assets

### 2. Development Server
- [ ] Run `npm run dev`
- [ ] Server starts on http://localhost:5173
- [ ] No console errors on startup

### 3. Authentication Flow
- [ ] Navigate to http://localhost:5173
- [ ] Redirects to /login automatically
- [ ] Login page displays correctly with USPS branding
- [ ] Enter credentials: admin / usps2024
- [ ] Login succeeds and redirects to /dashboard
- [ ] Welcome message shows "Welcome, John D."
- [ ] Logout button works and returns to login

### 4. Dashboard Page
- [ ] 4 statistics cards display correctly
- [ ] Address Details form is populated with sample data
- [ ] Map renders with Leaflet markers
- [ ] Address List table shows 3 sample addresses
- [ ] Pagination controls appear (if > 50 records)

### 5. My Addresses Page
- [ ] Navigate to "My Addresses" via sidebar
- [ ] Address form is editable
- [ ] State dropdown shows all 50 states + DC + PR
- [ ] Checkboxes work (Residential, Commercial, Active)
- [ ] Map updates when latitude/longitude change
- [ ] "Save" button adds/updates address
- [ ] "Delete" button removes address
- [ ] Changes persist after page refresh (IndexedDB)

### 6. Upload Data Page
- [ ] Navigate to "Upload Data" via sidebar
- [ ] Two upload zones displayed (System A, System B)
- [ ] Drag-and-drop CSV file works
- [ ] File browse button works
- [ ] Record count displays after upload
- [ ] "Run Analysis" button enabled after both files uploaded
- [ ] Progress bar shows during analysis
- [ ] Analysis results display with metrics
- [ ] Doughnut chart renders (Match Distribution)
- [ ] Bar chart renders (Discrepancy Breakdown)
- [ ] "Clear" button resets upload state

### 7. Settings Page
- [ ] Navigate to "Settings" via sidebar
- [ ] All sections display (Account, Display, Data, System)
- [ ] Username shows "admin"
- [ ] Display name input is editable
- [ ] Role badge shows "Administrator"
- [ ] Dropdowns work (Records per page, Theme, etc.)
- [ ] "Save Settings" button shows success state

### 8. Navigation
- [ ] Sidebar highlights active route
- [ ] Header stays sticky on scroll
- [ ] Eagle emoji displays in header
- [ ] All navigation links work
- [ ] Browser back/forward buttons work

### 9. Responsive Design
- [ ] Test on desktop (1920x1080)
- [ ] Test on tablet (768x1024)
- [ ] Test on mobile (375x667)
- [ ] Layout adjusts appropriately

### 10. Data Persistence
- [ ] Add a new address
- [ ] Refresh page
- [ ] New address still appears in list
- [ ] Login again
- [ ] Session restored (no re-login needed)
- [ ] Logout and close browser
- [ ] Open again - redirects to login

## 🐛 Known Issues to Verify

- [ ] Dynamic import warning (non-critical, can be ignored)
- [ ] npm audit vulnerability (in dependencies, low risk for demo)

## 📊 Sample CSV for Testing

Create two CSV files for Upload Data testing:

**system_a.csv:**
```csv
street,city,state,zip
123 Main St,Springfield,IL,62701
456 Oak Ave,Springfield,IL,62703
789 Pine Dr,Springfield,IL,62704
```

**system_b.csv:**
```csv
street,city,state,zip
123 Main Street,Springfield,IL,62701
456 Oak Avenue,Springfield,IL,62703
999 Elm St,Chicago,IL,60601
```

Expected: 2 matches (Main St/Street, Oak Ave/Avenue), 1 unmatched each

## 🚀 Docker Testing

### Development Container
- [ ] Run `docker-compose up dev`
- [ ] Access http://localhost:3000
- [ ] Hot reload works (edit a file, see changes)

### Production Container
- [ ] Run `docker-compose up app`
- [ ] Access http://localhost:8080
- [ ] App loads from nginx
- [ ] SPA routing works (refresh on /dashboard)

## 📝 Browser Console Checks

### No Errors Should Appear For:
- [ ] React component rendering
- [ ] Leaflet map initialization
- [ ] Chart.js rendering
- [ ] IndexedDB operations
- [ ] CSV parsing

### Acceptable Warnings:
- [ ] Dynamic import warning (Vite optimization)
- [ ] Leaflet marker icon path (fixed in code)

## ✅ Sign-off

After all tests pass:
- [ ] Application ready for production deployment
- [ ] Documentation reviewed
- [ ] Docker images built successfully
- [ ] No blocking issues identified

---

**Testing Status:** Ready for QA  
**Last Updated:** 2024-03-18  
**Build Version:** 0.0.0
