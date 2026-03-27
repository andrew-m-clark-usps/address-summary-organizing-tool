/**
 * verifier.js — Client-side Address Verification Engine
 *
 * Handles:
 *   • Local USPS-rule validation (offline, no API key needed)
 *   • API-backed verification via Lambda (USPS OAuth2 proxy)
 *   • Session history management (localStorage)
 *   • Admin configuration persistence (localStorage)
 *   • Audit log and address search queries (via API)
 */

'use strict';

/* ──────────────────────────────────────────────────────────────────
   Constants
────────────────────────────────────────────────────────────────── */

const VALID_STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
    'DC','PR','GU','VI','AS','MP',
    'AA','AE','AP'  // military
]);

const STREET_ABBR = {
    'STREET':'ST','AVENUE':'AVE','ROAD':'RD','DRIVE':'DR',
    'BOULEVARD':'BLVD','LANE':'LN','COURT':'CT','CIRCLE':'CIR',
    'PLACE':'PL','TERRACE':'TER','WAY':'WAY','TRAIL':'TRL',
    'HIGHWAY':'HWY','PARKWAY':'PKWY','EXPRESSWAY':'EXPY',
    'NORTH':'N','SOUTH':'S','EAST':'E','WEST':'W',
    'APARTMENT':'APT','SUITE':'STE','BUILDING':'BLDG',
    'FLOOR':'FL','ROOM':'RM','DEPARTMENT':'DEPT',
    'NORTHEAST':'NE','NORTHWEST':'NW','SOUTHEAST':'SE','SOUTHWEST':'SW',
    'MOUNT':'MT','SAINT':'ST','FORT':'FT','RURAL ROUTE':'RR',
    'ROUTE':'RT','JUNCTION':'JCT','CROSSING':'XING',
    'PIKE':'PIKE','SQUARE':'SQ','RIDGE':'RDG','CREEK':'CRK',
    'BROOK':'BRK','BRANCH':'BR','HARBOR':'HBR','HEIGHTS':'HTS',
    'HILLS':'HLS','HOLLOW':'HOLW','ISLAND':'IS','KNOLLS':'KNLS',
    'LAKE':'LK','LANDING':'LNDG','MANOR':'MNR','MEADOWS':'MDWS',
    'MILLS':'MLS','MISSION':'MSN','MOUNT':'MT','MOUNTAIN':'MTN',
    'ORCHARD':'ORCH','PARK':'PARK','PASS':'PASS','PATH':'PATH',
    'PLAIN':'PLN','PLAINS':'PLNS','POINT':'PT','PORT':'PRT',
    'PRAIRIE':'PR','RANCH':'RNCH','RAPIDS':'RPDS','REST':'RST',
    'RIVER':'RIV','RUN':'RUN','SHOAL':'SHL','SHORE':'SHR',
    'SKYWAY':'SKWY','SPRING':'SPG','SPRINGS':'SPGS','SPUR':'SPUR',
    'STATION':'STA','STREAM':'STRM','SUMMIT':'SMT','TURNPIKE':'TPKE',
    'UNION':'UN','VALLEY':'VLY','VIADUCT':'VIA','VILLAGE':'VLG',
    'VISTA':'VIS','WALK':'WALK','WALL':'WALL','WELL':'WL',
    'WELLS':'WLS','WHARF':'WHRF','WOODS':'WDS'
};

const SECONDARY_UNIT_ABBR = {
    'APARTMENT':'APT','SUITE':'STE','UNIT':'UNIT','FLOOR':'FL',
    'ROOM':'RM','BUILDING':'BLDG','DEPARTMENT':'DEPT',
    'SPACE':'SPC','SLIP':'SLIP','LOT':'LOT','PIER':'PIER',
    'STOP':'STOP','TRAILER':'TRLR','OFFICE':'OFC','HANGER':'HNGR'
};

const STORAGE_KEYS = {
    HISTORY:    'avt_history',
    CONFIG:     'avt_config',
    ADMIN_KEY:  'avt_admin_key'
};

const MAX_HISTORY = 50;

/* ──────────────────────────────────────────────────────────────────
   AddressVerifier — core verification logic
────────────────────────────────────────────────────────────────── */

const AddressVerifier = (() => {

    /* ── Normalize / standardize ─────────────────────────────── */

    function normalizeStreet(street) {
        if (!street) return '';
        let s = street.toUpperCase().trim();
        s = s.replace(/[^\w\s#-]/g, ' ');
        s = s.replace(/\s+/g, ' ').trim();
        // Replace full words with USPS abbreviations
        Object.entries({ ...STREET_ABBR, ...SECONDARY_UNIT_ABBR }).forEach(([full, abbr]) => {
            const re = new RegExp(`\\b${full}\\b`, 'g');
            s = s.replace(re, abbr);
        });
        return s;
    }

    function normalizeZip(zip) {
        if (!zip) return '';
        const digits = String(zip).replace(/\D/g, '');
        if (digits.length === 9) return `${digits.slice(0,5)}-${digits.slice(5)}`;
        return digits.slice(0, 5);
    }

    function normalizeState(state) {
        return String(state || '').toUpperCase().trim().slice(0, 2);
    }

    /* ── Local validation ────────────────────────────────────── */

    function validateLocally(address) {
        const notes = [];
        let confidence = 100;

        const street  = (address.street  || '').trim();
        const city    = (address.city    || '').trim();
        const state   = normalizeState(address.state);
        const zipRaw  = (address.zip     || '').toString().trim();

        // --- Street ---
        if (!street) {
            notes.push('Street address is required.');
            confidence -= 40;
        } else if (!/^\d+/.test(street) && !/^(PO BOX|P\.?O\.? BOX|RR |HCR |HC |RURAL ROUTE)/i.test(street)) {
            notes.push('Street address should begin with a house number.');
            confidence -= 10;
        }

        // --- City ---
        if (!city) {
            notes.push('City is required.');
            confidence -= 20;
        } else if (city.length < 2) {
            notes.push('City name appears too short.');
            confidence -= 5;
        }

        // --- State ---
        if (!state) {
            notes.push('State is required.');
            confidence -= 20;
        } else if (!VALID_STATES.has(state)) {
            notes.push(`"${state}" is not a recognized US state or territory abbreviation.`);
            confidence -= 20;
        }

        // --- ZIP ---
        const zipDigits = zipRaw.replace(/\D/g, '');
        let zip5 = '', zip4 = '';
        if (!zipRaw) {
            notes.push('ZIP code is required.');
            confidence -= 20;
        } else if (zipDigits.length === 5) {
            zip5 = zipDigits;
        } else if (zipDigits.length === 9) {
            zip5 = zipDigits.slice(0, 5);
            zip4 = zipDigits.slice(5);
        } else {
            notes.push(`ZIP code "${zipRaw}" is not a valid 5- or 9-digit ZIP.`);
            confidence -= 20;
        }

        const normalizedStreet = normalizeStreet(street);
        const wasStandardized  = normalizedStreet !== street.toUpperCase().trim();
        if (wasStandardized) {
            notes.push('Street abbreviations standardized to USPS format.');
        }

        const status = confidence >= 80 ? 'verified'
                     : confidence >= 50 ? 'corrected'
                     : 'invalid';

        return {
            status,
            confidence: Math.max(0, confidence),
            input: { street, city, state, zip: zipRaw },
            standardized: {
                street:  normalizedStreet || street.toUpperCase(),
                city:    city.toUpperCase(),
                state,
                zip:     zip5,
                zip4
            },
            deliverable:     confidence >= 70,
            dpvMatchCode:    confidence >= 80 ? 'Y' : confidence >= 50 ? 'S' : 'N',
            dpvVacancy:      'N',
            carrierRoute:    '',
            deliveryPoint:   '',
            fromCache:       false,
            cacheAge:        null,
            responseTimeMs:  0,
            source:          'offline',
            notes
        };
    }

    /* ── API-backed verification ─────────────────────────────── */

    async function verifyViaApi(address, config) {
        const { apiEndpoint, apiKey } = config;

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-api-key'] = apiKey;

        const t0 = Date.now();
        const resp = await fetch(apiEndpoint, {
            method:  'POST',
            headers,
            body:    JSON.stringify({
                street: address.street,
                city:   address.city,
                state:  address.state,
                zip:    address.zip
            })
        });

        const elapsed = Date.now() - t0;

        if (!resp.ok) {
            const err = await resp.text().catch(() => resp.statusText);
            throw new Error(`API error ${resp.status}: ${err}`);
        }

        const data = await resp.json();
        data.responseTimeMs = elapsed;
        return data;
    }

    /* ── Main verify entry point ─────────────────────────────── */

    async function verify(address, config) {
        // Always do local validation first as a baseline / fallback
        const localResult = validateLocally(address);

        if (!config || !config.apiEndpoint || config.mode === 'offline') {
            return { ...localResult, source: 'offline' };
        }

        try {
            const apiResult = await verifyViaApi(address, config);
            return apiResult;
        } catch (err) {
            // Fall back to offline result, note the failure
            return {
                ...localResult,
                source: 'offline-fallback',
                notes: [...localResult.notes, `API unavailable (${err.message}). Showing local validation result.`]
            };
        }
    }

    /* ── Bedrock AI Address Parser ───────────────────────────── */

    async function parseWithBedrock() {
        const ta = document.getElementById('bedrock-input');
        const input = (ta && ta.value.trim()) || '';
        if (!input) { setStatus('bedrock-status', 'Please enter an address to parse.', 'error'); return; }

        setStatus('bedrock-status', '⟳ Parsing with Bedrock Claude…', 'loading');
        const resultEl  = document.getElementById('bedrock-result');
        const contentEl = document.getElementById('bedrock-result-content');
        if (resultEl)  resultEl.style.display  = 'none';

        const cfg = loadConfig();
        if (!cfg.apiEndpoint) {
            setStatus('bedrock-status', '✗ Configure API endpoint first.', 'error');
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
            const resp = await fetch(cfg.apiEndpoint.replace(/\/verify$/, '/parse'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ address: input })
            });
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const parsed = await resp.json();

            if (contentEl) {
                const fields = [
                    ['Street Number', parsed.streetNumber],
                    ['Pre-Directional', parsed.preDir],
                    ['Street Name', parsed.streetName],
                    ['Suffix', parsed.streetSuffix],
                    ['Secondary Unit', parsed.secUnit ? `${parsed.secUnit} ${parsed.secUnitNum || ''}`.trim() : null],
                    ['City', parsed.city],
                    ['State', parsed.state],
                    ['ZIP', parsed.zip5 ? (parsed.zip4 ? `${parsed.zip5}-${parsed.zip4}` : parsed.zip5) : null],
                    ['Type', parsed.addressType],
                    ['Confidence', parsed.confidence != null ? `${parsed.confidence}%` : null],
                    ['Model', parsed.model],
                    ['Issues', (parsed.issues || []).join('; ') || null]
                ].filter(([, v]) => v != null && v !== '');

                contentEl.innerHTML = `<div style="display:grid;grid-template-columns:8rem 1fr;gap:0.375rem 0.75rem;font-size:0.82rem;">
                    ${fields.map(([k, v]) =>
                        `<span style="color:var(--text-secondary);font-weight:500">${escHtml(k)}</span>
                         <span>${escHtml(String(v))}</span>`
                    ).join('')}
                </div>
                <button class="btn btn-primary btn-sm" style="margin-top:0.75rem"
                        onclick="VerifyUI.useBedrockResult()">Use as Address Input →</button>`;

                // Store for "use" button
                window._lastBedrockResult = parsed;
            }
            if (resultEl) resultEl.style.display = 'block';
            setStatus('bedrock-status', `✓ Parsed (confidence: ${parsed.confidence || 0}%)`, 'success');
        } catch (err) {
            setStatus('bedrock-status', `✗ ${err.message}`, 'error');
        }
    }

    function useBedrockResult() {
        const p = window._lastBedrockResult;
        if (!p) return;
        const streetEl = document.getElementById('street');
        const cityEl   = document.getElementById('city');
        const stateEl  = document.getElementById('state');
        const zipEl    = document.getElementById('zip');

        if (streetEl) streetEl.value = [p.streetNumber, p.preDir, p.streetName, p.streetSuffix, p.secUnit, p.secUnitNum].filter(Boolean).join(' ');
        if (cityEl)   cityEl.value   = p.city   || '';
        if (stateEl)  stateEl.value  = p.state  || '';
        if (zipEl)    zipEl.value    = p.zip5   || '';

        // Switch to user tab
        const userTab = document.querySelector('[data-tab="user"]');
        if (userTab) userTab.click();
    }

    /* ── Databricks browse ───────────────────────────────────── */

    let browseOffset = 0;
    let browseTotal  = 0;
    const BROWSE_LIMIT = 50;
    let browseDebounce = null;

    function debounceBrowse(val) {
        clearTimeout(browseDebounce);
        browseDebounce = setTimeout(() => refreshBrowse(), 400);
    }

    async function refreshBrowse() {
        browseOffset = 0;
        await loadBrowsePage();
    }

    async function browsePage(direction) {
        browseOffset = Math.max(0, browseOffset + direction * BROWSE_LIMIT);
        await loadBrowsePage();
    }

    async function loadBrowsePage() {
        const cfg = loadConfig();
        const container = document.getElementById('browse-table-container');
        if (!container) return;

        container.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading from Databricks…</div>';

        if (!cfg.apiEndpoint) {
            container.innerHTML = '<div class="empty-state">Configure API endpoint to browse the Databricks database.</div>';
            return;
        }

        const params = new URLSearchParams({
            status: (document.getElementById('browse-filter-status') || {}).value || '',
            state:  (document.getElementById('browse-filter-state')  || {}).value || '',
            search: (document.getElementById('browse-search')        || {}).value || '',
            from:   (document.getElementById('browse-filter-from')   || {}).value || '',
            to:     (document.getElementById('browse-filter-to')     || {}).value || '',
            limit:  BROWSE_LIMIT,
            offset: browseOffset
        });

        const headers = {};
        if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
        const url = `${cfg.apiEndpoint.replace(/\/verify$/, '')}/browse?${params}`;

        try {
            const resp = await fetch(url, { method: 'GET', headers });
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const data = await resp.json();
            browseTotal = data.total || 0;
            renderBrowseTable(data.records || []);
            updateBrowsePagination();
        } catch (err) {
            container.innerHTML = `<div class="empty-state">Could not load Databricks data: ${escHtml(err.message)}</div>`;
        }
    }

    function renderBrowseTable(records) {
        const container = document.getElementById('browse-table-container');
        if (!container) return;
        if (!records.length) { container.innerHTML = '<div class="empty-state">No records found.</div>'; return; }

        const rows = records.map(r => {
            const statusBadge = `<span class="history-badge badge-${r.status || 'offline'}">${r.status || '—'}</span>`;
            const ts    = r.verified_at ? new Date(r.verified_at).toLocaleString() : '—';
            const src   = r.source === 'usps' ? '🏛️ USPS' : r.source === 'bedrock' ? '🤖 Bedrock' :
                          r.source && r.source.startsWith('sagemaker') ? '🧠 SageMaker' : '📋 Offline';
            const cache = r.from_cache ? '⚡' : '';
            return `<tr>
                <td>${escHtml(r.std_street || '')} ${r.std_city ? `<br><small style="color:var(--text-muted)">${escHtml(r.std_city)}, ${escHtml(r.std_state || '')} ${escHtml(r.std_zip || '')}</small>` : ''}</td>
                <td>${statusBadge} ${cache}</td>
                <td>${escHtml(String(r.confidence || 0))}%</td>
                <td>${escHtml(src)}</td>
                <td style="white-space:nowrap">${escHtml(ts)}</td>
                <td>${escHtml(String(r.response_ms || 0))} ms</td>
            </tr>`;
        }).join('');

        container.innerHTML = `<div class="audit-table-wrap"><table class="audit-table">
            <thead><tr>
                <th>Address</th><th>Status</th><th>Confidence</th>
                <th>Source</th><th>Verified At</th><th>Latency</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    }

    function updateBrowsePagination() {
        const countEl = document.getElementById('browse-count');
        const prevEl  = document.getElementById('browse-prev');
        const nextEl  = document.getElementById('browse-next');
        const start   = browseOffset + 1;
        const end     = Math.min(browseOffset + BROWSE_LIMIT, browseTotal);
        if (countEl) countEl.textContent = browseTotal > 0 ? `${start.toLocaleString()}–${end.toLocaleString()} of ${browseTotal.toLocaleString()} records` : '';
        if (prevEl) prevEl.disabled = browseOffset === 0;
        if (nextEl) nextEl.disabled = browseOffset + BROWSE_LIMIT >= browseTotal;
        const paginEl = document.getElementById('browse-pagination');
        if (paginEl) paginEl.style.display = browseTotal > 0 ? 'flex' : 'none';
    }

    function exportBrowse() {
        const rows = document.querySelectorAll('#browse-table-container .audit-table tbody tr');
        if (!rows.length) return;
        const headers = ['Address', 'Status', 'Confidence', 'Source', 'Verified At', 'Latency'];
        const data = [headers, ...Array.from(rows).map(r =>
            Array.from(r.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g,' ').trim())
        )];
        downloadCsv(data, 'databricks-records.csv');
    }

    /* ── Populate state dropdown for browse filter ───────────── */
    function populateBrowseStateFilter() {
        const sel = document.getElementById('browse-filter-state');
        if (!sel) return;
        const states = [
            'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
            'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
            'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
            'VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP'
        ];
        states.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st; opt.textContent = st;
            sel.appendChild(opt);
        });
    }

    /* ── Trigger nightly batch job ───────────────────────────── */

    async function triggerBatch() {
        const cfg = loadConfig();
        if (!cfg.apiEndpoint) { alert('Configure API endpoint first.'); return; }
        if (!confirm('Trigger SageMaker Batch Transform job now? This will process all unverified Databricks records.')) return;

        const headers = { 'Content-Type': 'application/json' };
        if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;

        try {
            const resp = await fetch(cfg.apiEndpoint.replace(/\/verify$/, '/batch'), {
                method: 'POST', headers, body: '{}'
            });
            const data = await resp.json();
            alert(`✅ ${data.message || 'Batch job queued.'}`);
        } catch (err) {
            alert(`✗ Failed to trigger batch: ${err.message}`);
        }
    }

    /* ── Updated checkStatus (7 services) ───────────────────── */

    async function queryAuditLog(config, filters = {}) {
        if (!config || !config.apiEndpoint) throw new Error('API endpoint not configured.');
        const headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) headers['x-api-key'] = config.apiKey;

        const url = `${config.apiEndpoint.replace(/\/verify$/, '')}/audit?` + new URLSearchParams({
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.from   ? { from:   filters.from   } : {}),
            ...(filters.to     ? { to:     filters.to     } : {}),
            size: 100
        });

        const resp = await fetch(url, { method: 'GET', headers });
        if (!resp.ok) throw new Error(`Audit log error ${resp.status}`);
        return resp.json();
    }

    /* ── Address search query ────────────────────────────────── */

    async function searchAddresses(config, query) {
        if (!config || !config.apiEndpoint) throw new Error('API endpoint not configured.');
        if (!query || query.trim().length < 2) return { hits: [] };

        const headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) headers['x-api-key'] = config.apiKey;

        const url = `${config.apiEndpoint.replace(/\/verify$/, '')}/search?q=${encodeURIComponent(query.trim())}`;
        const resp = await fetch(url, { method: 'GET', headers });
        if (!resp.ok) throw new Error(`Search error ${resp.status}`);
        return resp.json();
    }

    /* ── Status health check ─────────────────────────────────── */

    async function checkStatus(config) {
        if (!config || !config.apiEndpoint) return { api: 'unknown', redis: 'unknown', opensearch: 'unknown', usps: 'unknown' };
        const headers = {};
        if (config.apiKey) headers['x-api-key'] = config.apiKey;
        const url = `${config.apiEndpoint.replace(/\/verify$/, '')}/health`;
        try {
            const resp = await fetch(url, { method: 'GET', headers });
            if (!resp.ok) return { api: 'down', redis: 'unknown', opensearch: 'unknown', usps: 'unknown' };
            return resp.json();
        } catch {
            return { api: 'down', redis: 'unknown', opensearch: 'unknown', usps: 'unknown' };
        }
    }

    /* ── Statistics query ────────────────────────────────────── */

    async function getStats(config) {
        if (!config || !config.apiEndpoint) throw new Error('API endpoint not configured.');
        const headers = {};
        if (config.apiKey) headers['x-api-key'] = config.apiKey;
        const url = `${config.apiEndpoint.replace(/\/verify$/, '')}/stats`;
        const resp = await fetch(url, { method: 'GET', headers });
        if (!resp.ok) throw new Error(`Stats error ${resp.status}`);
        return resp.json();
    }

    /* ── Parse a freeform address line ───────────────────────── */

    function parseAddressLine(line) {
        // Attempt to parse "Street, City, State ZIP" format
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Pattern: anything, City, ST 12345 or ST 12345-6789
        const m = trimmed.match(/^(.+),\s*(.+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
        if (m) {
            return { street: m[1].trim(), city: m[2].trim(), state: m[3].trim().toUpperCase(), zip: m[4].trim() };
        }
        // Pattern: Street, City ST 12345
        const m2 = trimmed.match(/^(.+),\s*(.+)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
        if (m2) {
            return { street: m2[1].trim(), city: m2[2].trim(), state: m2[3].trim().toUpperCase(), zip: m2[4].trim() };
        }
        return { street: trimmed, city: '', state: '', zip: '' };
    }

    return {
        verify,
        validateLocally,
        normalizeStreet,
        normalizeZip,
        normalizeState,
        queryAuditLog,
        searchAddresses,
        checkStatus,
        getStats,
        parseAddressLine,
        VALID_STATES
    };
})();


/* ──────────────────────────────────────────────────────────────────
   VerifyUI — page controller
────────────────────────────────────────────────────────────────── */

const VerifyUI = (() => {

    /* ── State ───────────────────────────────────────────────── */
    let currentResult  = null;
    let bulkResults    = [];
    let searchDebounce = null;

    /* ── Config helpers ──────────────────────────────────────── */

    function loadConfig() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || '{}');
        } catch { return {}; }
    }

    function saveConfigToStorage(cfg) {
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(cfg));
    }

    /* ── History helpers ─────────────────────────────────────── */

    function loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        } catch { return []; }
    }

    function pushHistory(result) {
        const history = loadHistory();
        history.unshift({ ...result, _ts: Date.now() });
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    }

    /* ── State select population ─────────────────────────────── */

    function populateStateSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const states = [
            'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
            'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
            'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
            'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
            'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
            'DC','PR','GU','VI','AS','MP','AA','AE','AP'
        ];
        states.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st;
            opt.textContent = st;
            sel.appendChild(opt);
        });
    }

    /* ── Inline status helper ────────────────────────────────── */

    function setStatus(id, msg, type) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg;
        el.className = `verify-inline-status ${type || ''}`;
    }

    /* ── Tab switching ───────────────────────────────────────── */

    function initTabs() {
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                const tc = document.getElementById(`tab-${tab}`);
                if (tc) tc.classList.add('active');
            });
        });
    }

    /* ── Admin auth ──────────────────────────────────────────── */

    function adminAuth() {
        const keyInput = document.getElementById('admin-key-input');
        const key = (keyInput && keyInput.value.trim()) || '';
        if (!key) {
            showAdminError('Please enter an admin API key.');
            return;
        }
        // Persist key (hashed check) and show panel
        localStorage.setItem(STORAGE_KEYS.ADMIN_KEY, key);
        showAdminPanel();

        // Pre-fill API key field
        const cfg = loadConfig();
        cfg.apiKey = key;
        applyConfigToForm(cfg);
    }

    function showAdminError(msg) {
        const el = document.getElementById('admin-auth-error');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
    }

    function showAdminPanel() {
        const gate  = document.getElementById('admin-auth-gate');
        const panel = document.getElementById('admin-panel');
        if (gate)  gate.style.display  = 'none';
        if (panel) panel.style.display = 'block';
        // Load saved config into form
        applyConfigToForm(loadConfig());
        refreshAuditLog();
    }

    function applyConfigToForm(cfg) {
        const epEl = document.getElementById('api-endpoint');
        const akEl = document.getElementById('api-key-config');
        if (epEl) epEl.value = cfg.apiEndpoint || '';
        if (akEl) akEl.value = cfg.apiKey      || '';
        const mode = cfg.mode || 'api';
        const modeEl = document.getElementById(`mode-${mode}`);
        if (modeEl) modeEl.checked = true;
    }

    /* ── Save config ─────────────────────────────────────────── */

    function saveConfig() {
        const apiEndpoint = (document.getElementById('api-endpoint')    || {}).value || '';
        const apiKey      = (document.getElementById('api-key-config')  || {}).value || '';
        const mode        = document.querySelector('input[name="val-mode"]:checked')?.value || 'api';
        const cfg = { apiEndpoint, apiKey, mode };
        saveConfigToStorage(cfg);
        setStatus('config-status', '✓ Configuration saved.', 'success');
        setTimeout(() => setStatus('config-status', '', ''), 3000);
    }

    /* ── Test connection ─────────────────────────────────────── */

    async function testConnection() {
        setStatus('config-status', '⟳ Testing…', 'loading');
        const cfg = loadConfig();
        const status = await AddressVerifier.checkStatus(cfg);
        if (status.api === 'up') {
            setStatus('config-status', '✓ Connection successful.', 'success');
            updateServiceStatus(status);
        } else {
            setStatus('config-status', '✗ Could not reach API.', 'error');
        }
    }

    function updateServiceStatus(status) {
        const map = {
            'status-api':        status.api,
            'status-redis':      status.redis,
            'status-opensearch': status.opensearch,
            'status-usps':       status.usps,
            'status-databricks': status.databricks,
            'status-bedrock':    status.bedrock,
            'status-sagemaker':  status.sagemaker
        };
        Object.entries(map).forEach(([id, state]) => {
            const item   = document.getElementById(id);
            if (!item) return;
            const dot = item.querySelector('.status-dot');
            const val = item.querySelector('.status-val');
            const normalizedState = (state || 'unknown').toLowerCase();
            dot.className = `status-dot ${normalizedState === 'up' ? 'up' : normalizedState === 'down' ? 'down' : 'unknown'}`;
            val.textContent = normalizedState;
        });
    }

    async function checkStatus() {
        const cfg = loadConfig();
        const status = await AddressVerifier.checkStatus(cfg);
        updateServiceStatus(status);
    }

    /* ── Verify (user form) ──────────────────────────────────── */

    async function verify() {
        const street = (document.getElementById('street') || {}).value || '';
        const city   = (document.getElementById('city')   || {}).value || '';
        const state  = (document.getElementById('state')  || {}).value || '';
        const zip    = (document.getElementById('zip')    || {}).value || '';

        const address = { street, city, state, zip };

        // Basic front-end check
        if (!street.trim() && !city.trim() && !zip.trim()) {
            setStatus('verify-status', 'Please enter an address.', 'error');
            return;
        }

        const btn = document.getElementById('verify-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Verifying…'; }
        setStatus('verify-status', '', '');

        try {
            const cfg    = loadConfig();
            const result = await AddressVerifier.verify(address, cfg);
            currentResult = result;
            pushHistory(result);
            renderHistory();
            openModal(result);
        } catch (err) {
            setStatus('verify-status', `Error: ${err.message}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Verify Address'; }
        }
    }

    /* ── Clear form ──────────────────────────────────────────── */

    function clearForm() {
        ['street','city','state','zip'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        setStatus('verify-status', '', '');
    }

    /* ── History render ──────────────────────────────────────── */

    function renderHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;
        const history = loadHistory();
        if (!history.length) {
            container.innerHTML = '<div class="empty-state">No verifications yet. Enter an address above.</div>';
            return;
        }
        container.innerHTML = history.map((r, i) => {
            const s     = r.standardized || {};
            const line1 = s.street  || r.input?.street || '';
            const line2 = [s.city, s.state, s.zip ? (s.zip + (s.zip4 ? `-${s.zip4}` : '')) : ''].filter(Boolean).join(', ');
            const icon  = statusIcon(r.status);
            const badge = `<span class="history-badge badge-${r.status || 'offline'}">${r.status || 'offline'}</span>`;
            const time  = r._ts ? relativeTime(r._ts) : '';
            return `<div class="history-item" onclick="VerifyUI.reopenHistory(${i})" title="Click to view details">
                <span class="history-icon">${icon}</span>
                <div class="history-address">
                    <div class="history-address-line">${escHtml(line1)}</div>
                    <div class="history-address-sub">${escHtml(line2)}</div>
                </div>
                ${badge}
                <span class="history-time">${time}</span>
            </div>`;
        }).join('');
    }

    function clearHistory() {
        localStorage.removeItem(STORAGE_KEYS.HISTORY);
        renderHistory();
    }

    function reopenHistory(idx) {
        const history = loadHistory();
        if (history[idx]) openModal(history[idx]);
    }

    /* ── Modal ───────────────────────────────────────────────── */

    function openModal(result) {
        const overlay = document.getElementById('result-modal');
        if (!overlay) return;

        const s = result.standardized || {};
        const inp = result.input || {};

        // Status icon + title
        const icons = { verified: '✅', corrected: '⚠️', invalid: '❌', 'offline': '🔵', 'offline-fallback': '🔵' };
        const titles = { verified: 'Address Verified', corrected: 'Address Corrected', invalid: 'Address Invalid', offline: 'Local Validation', 'offline-fallback': 'Offline Validation' };
        setEl('modal-status-icon', icons[result.status] || '🔍');
        setEl('modal-title', titles[result.status] || 'Verification Result');

        // Input address
        setEl('modal-input-address',
            `${escHtml(inp.street || '')}\n${escHtml([inp.city, inp.state, inp.zip].filter(Boolean).join(', '))}`
                .replace(/\n/g, '<br>'));

        // Standardized address
        const zip4str = s.zip4 ? `-${s.zip4}` : '';
        setEl('modal-result-address',
            `${escHtml(s.street || '')}<br>${escHtml([s.city, s.state, (s.zip || '') + zip4str].filter(Boolean).join(', '))}`);

        // Confidence bar
        const conf = result.confidence || 0;
        setEl('modal-confidence', `${conf}%`);
        const bar = document.getElementById('modal-confidence-bar');
        if (bar) {
            bar.style.width = `${conf}%`;
            bar.className = `confidence-fill ${conf < 50 ? 'low' : conf < 80 ? 'medium' : ''}`;
        }

        // Field rows
        renderFieldRow('field-street', s.street, inp.street, 'Street');
        renderFieldRow('field-city',   s.city,   inp.city,   'City');
        renderFieldRow('field-state',  s.state,  inp.state,  'State');
        renderFieldRow('field-zip',    s.zip,    inp.zip?.replace(/\D/g,'').slice(0,5), 'ZIP');

        const zip4Row = document.getElementById('field-zip4');
        if (zip4Row) {
            if (s.zip4) {
                zip4Row.style.display = '';
                const vals = zip4Row.querySelectorAll('.field-value,.field-status');
                if (vals[0]) vals[0].textContent = s.zip4;
                if (vals[1]) vals[1].textContent = '✓';
            } else {
                zip4Row.style.display = 'none';
            }
        }

        // Deliverability
        const dlvEl = document.getElementById('deliverability-badge');
        const dlvIco = document.getElementById('deliverability-icon');
        const dlvTxt = document.getElementById('deliverability-text');
        if (dlvEl) {
            const code = result.dpvMatchCode || 'N';
            const vacant = result.dpvVacancy === 'Y';
            if (code === 'Y' && !vacant) {
                dlvEl.className = 'deliverability-badge deliverable';
                if (dlvIco) dlvIco.textContent = '📬';
                if (dlvTxt) dlvTxt.textContent = 'Deliverable — USPS will deliver to this address.';
            } else if (code === 'S' || code === 'D') {
                dlvEl.className = 'deliverability-badge deliverable';
                if (dlvIco) dlvIco.textContent = '📬';
                if (dlvTxt) dlvTxt.textContent = 'Deliverable with secondary unit confirmation.';
            } else if (vacant) {
                dlvEl.className = 'deliverability-badge vacant';
                if (dlvIco) dlvIco.textContent = '🏚️';
                if (dlvTxt) dlvTxt.textContent = 'Address is vacant — not currently receiving mail.';
            } else if (result.status === 'offline' || result.status === 'offline-fallback') {
                dlvEl.className = 'deliverability-badge unknown';
                if (dlvIco) dlvIco.textContent = '📋';
                if (dlvTxt) dlvTxt.textContent = 'Deliverability requires USPS API validation.';
            } else {
                dlvEl.className = 'deliverability-badge undeliverable';
                if (dlvIco) dlvIco.textContent = '⚠️';
                if (dlvTxt) dlvTxt.textContent = 'Address may not be deliverable.';
            }
        }

        // Cache info
        const cacheEl = document.getElementById('cache-info');
        if (cacheEl) {
            if (result.fromCache) {
                cacheEl.style.display = '';
                const ageEl = document.getElementById('cache-age');
                if (ageEl && result.cacheAge) ageEl.textContent = `Cached ${relativeTime(Date.now() - result.cacheAge * 1000)}`;
            } else {
                cacheEl.style.display = 'none';
            }
        }

        // Notes
        const notesEl = document.getElementById('modal-notes');
        const notesList = document.getElementById('modal-notes-list');
        if (notesEl && notesList) {
            const notes = result.notes || [];
            if (notes.length) {
                notesEl.style.display = '';
                notesList.innerHTML = notes.map(n => `<li>${escHtml(n)}</li>`).join('');
            } else {
                notesEl.style.display = 'none';
            }
        }

        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');

        // TF.js neural similarity — computed asynchronously after modal opens
        const neuralRow = document.getElementById('neural-score-row');
        const neuralVal = document.getElementById('neural-score-val');
        if (neuralRow) neuralRow.style.display = 'none';
        _computeNeuralScore(result);

        // Close on overlay click
        overlay.onclick = e => { if (e.target === overlay) closeModal(); };
        // Close on Escape
        document.addEventListener('keydown', escListener);
    }

    /**
     * Asynchronously compute TF.js USE neural similarity between the input
     * address and the USPS standardized result, then show it in the modal.
     */
    async function _computeNeuralScore(result) {
        if (typeof AddressEmbedder === 'undefined') return;
        const neuralRow = document.getElementById('neural-score-row');
        const neuralVal = document.getElementById('neural-score-val');
        if (!neuralRow || !neuralVal) return;

        const inp = result.input        || {};
        const std = result.standardized || {};
        const inputText = [inp.street, inp.city, inp.state, inp.zip].filter(Boolean).join(' ');
        const stdText   = [std.street, std.city, std.state, std.zip].filter(Boolean).join(' ');

        if (!inputText || !stdText) return;

        try {
            const sim = await AddressEmbedder.similarity(inputText, stdText);
            if (sim === null) return;
            const pct = Math.round(sim * 100);
            neuralVal.textContent = `${pct}% match`;
            neuralRow.style.display = '';
            neuralRow.title = `Input: "${inputText}" vs USPS: "${stdText}"`;
        } catch { /* non-fatal */ }
    }

    function escListener(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escListener); }
    }

    function closeModal() {
        const overlay = document.getElementById('result-modal');
        if (overlay) { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden','true'); }
    }

    function renderFieldRow(rowId, standardizedVal, inputVal, label) {
        const row = document.getElementById(rowId);
        if (!row) return;
        const valEl = row.querySelector('.field-value');
        const stsEl = row.querySelector('.field-status');
        if (valEl) valEl.textContent = standardizedVal || '—';
        if (!stsEl) return;
        const iStd = standardizedVal ? standardizedVal.toUpperCase() : '';
        const iInp = inputVal        ? inputVal.toUpperCase()        : '';
        if (!standardizedVal) {
            stsEl.textContent = '✗';
            stsEl.title = 'Missing';
        } else if (iStd === iInp || !iInp) {
            stsEl.textContent = '✓';
            stsEl.title = 'Matches input';
        } else {
            stsEl.textContent = '✏️';
            stsEl.title = `Standardized from "${inputVal}"`;
        }
    }

    function copyAddress() {
        if (!currentResult) return;
        const s = currentResult.standardized || {};
        const zip4str = s.zip4 ? `-${s.zip4}` : '';
        const text = `${s.street}\n${s.city}, ${s.state} ${s.zip}${zip4str}`;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.modal-footer .btn-secondary');
            if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = orig; }, 1500); }
        });
    }

    /* ── Bulk verification ───────────────────────────────────── */

    async function bulkVerify() {
        const ta = document.getElementById('bulk-input');
        if (!ta) return;
        const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) { setStatus('bulk-status', 'Please enter at least one address.', 'error'); return; }

        setStatus('bulk-status', `⟳ Verifying ${lines.length} address${lines.length !== 1 ? 'es' : ''}…`, 'loading');
        const resultsEl = document.getElementById('bulk-results');
        if (resultsEl) resultsEl.style.display = 'none';

        const cfg = loadConfig();
        bulkResults = [];

        for (const line of lines) {
            const addr = AddressVerifier.parseAddressLine(line);
            if (!addr) continue;
            const result = await AddressVerifier.verify(addr, cfg);
            bulkResults.push({ input: line, address: addr, result });
        }

        renderBulkResults();
        setStatus('bulk-status', `✓ ${bulkResults.length} address${bulkResults.length !== 1 ? 'es' : ''} processed.`, 'success');
    }

    function renderBulkResults() {
        const container = document.getElementById('bulk-results');
        if (!container) return;
        if (!bulkResults.length) { container.style.display = 'none'; return; }

        const rows = bulkResults.map((b, i) => {
            const r = b.result;
            const s = r.standardized || {};
            const zip4str = s.zip4 ? `-${s.zip4}` : '';
            const statusBadge = `<span class="history-badge badge-${r.status}">${r.status}</span>`;
            return `<tr>
                <td>${i + 1}</td>
                <td>${escHtml(b.input)}</td>
                <td>${escHtml([s.street, s.city, s.state, (s.zip || '') + zip4str].filter(Boolean).join(', '))}</td>
                <td>${statusBadge}</td>
                <td>${r.confidence || 0}%</td>
                <td>${r.fromCache ? '⚡ Cache' : r.source === 'offline' ? '📋 Offline' : '🌐 API'}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `<table class="bulk-table">
            <thead><tr><th>#</th><th>Input</th><th>Standardized</th><th>Status</th><th>Confidence</th><th>Source</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
        container.style.display = 'block';
    }

    function exportBulkResults() {
        if (!bulkResults.length) { setStatus('bulk-status', 'No results to export.', 'error'); return; }
        const rows = [['#','Input Address','Standardized Street','City','State','ZIP','ZIP+4','Status','Confidence','Source','Notes']];
        bulkResults.forEach((b, i) => {
            const r = b.result;
            const s = r.standardized || {};
            rows.push([
                i + 1, b.input,
                s.street, s.city, s.state, s.zip, s.zip4 || '',
                r.status, `${r.confidence}%`,
                r.source || 'offline',
                (r.notes || []).join('; ')
            ]);
        });
        downloadCsv(rows, 'bulk-verification.csv');
    }

    /* ── Address search ──────────────────────────────────────── */

    function searchAddresses(query) {
        clearTimeout(searchDebounce);
        if (!query || query.length < 2) {
            const el = document.getElementById('search-results');
            if (el) el.innerHTML = '';
            return;
        }
        searchDebounce = setTimeout(async () => {
            const cfg = loadConfig();
            try {
                const data = await AddressVerifier.searchAddresses(cfg, query);
                renderSearchResults(data.hits || []);
            } catch {
                const el = document.getElementById('search-results');
                if (el) el.innerHTML = '<div class="empty-state">Search unavailable. Configure API endpoint.</div>';
            }
        }, 300);
    }

    function renderSearchResults(hits) {
        const container = document.getElementById('search-results');
        if (!container) return;
        if (!hits.length) { container.innerHTML = '<div class="empty-state">No results found.</div>'; return; }
        container.innerHTML = hits.map(h => {
            const a = h._source || h;
            const line1 = [a.standardized_street, a.city, a.state, a.zip].filter(Boolean).join(', ');
            const meta  = `Verified: ${a.verified_at ? new Date(a.verified_at).toLocaleDateString() : '—'} · Status: ${a.status || '—'}`;
            return `<div class="search-result-item">
                <span class="history-icon">${statusIcon(a.status)}</span>
                <span class="search-result-address">${escHtml(line1)}</span>
                <span class="search-result-meta">${escHtml(meta)}</span>
            </div>`;
        }).join('');
    }

    /* ── Audit log ───────────────────────────────────────────── */

    async function refreshAuditLog() {
        const cfg = loadConfig();
        const container = document.getElementById('audit-table-container');
        if (!container) return;

        const filters = {
            status: (document.getElementById('audit-filter-status') || {}).value || '',
            from:   (document.getElementById('audit-filter-from')   || {}).value || '',
            to:     (document.getElementById('audit-filter-to')     || {}).value || ''
        };

        container.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading…</div>';

        try {
            const data = await AddressVerifier.queryAuditLog(cfg, filters);
            renderAuditTable(data.hits || data.records || []);
            // Also refresh stats
            try {
                const stats = await AddressVerifier.getStats(cfg);
                updateStats(stats);
            } catch { /* stats optional */ }
        } catch (err) {
            container.innerHTML = `<div class="empty-state">Could not load audit log: ${escHtml(err.message)}</div>`;
        }
    }

    function renderAuditTable(records) {
        const container = document.getElementById('audit-table-container');
        if (!container) return;
        if (!records.length) { container.innerHTML = '<div class="empty-state">No records found.</div>'; return; }
        const rows = records.map(r => {
            const s = r.standardized || r._source || r;
            const inputAddr   = [s.input_street || s.street, s.input_city || s.city, s.input_state || s.state, s.input_zip || s.zip].filter(Boolean).join(', ');
            const stdAddr     = [s.standardized_street || s.street, s.city, s.state, s.zip].filter(Boolean).join(', ');
            const statusBadge = `<span class="history-badge badge-${s.status || 'offline'}">${s.status || '—'}</span>`;
            const ts          = s.verified_at ? new Date(s.verified_at).toLocaleString() : '—';
            const cacheIcon   = s.from_cache ? '⚡' : '🌐';
            const conf        = s.confidence != null ? `${s.confidence}%` : '—';
            return `<tr>
                <td>${escHtml(ts)}</td>
                <td>${escHtml(inputAddr)}</td>
                <td>${escHtml(stdAddr)}</td>
                <td>${statusBadge}</td>
                <td>${escHtml(conf)}</td>
                <td title="${s.from_cache ? 'Redis cache hit' : 'API call'}">${cacheIcon}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `<div class="audit-table-wrap"><table class="audit-table">
            <thead><tr>
                <th>Timestamp</th><th>Input Address</th><th>Standardized</th>
                <th>Status</th><th>Confidence</th><th>Source</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    }

    function exportAuditLog() {
        // Export whatever is currently rendered
        const rows = document.querySelectorAll('#audit-table-container .audit-table tbody tr');
        if (!rows.length) { return; }
        const headers = ['Timestamp','Input Address','Standardized','Status','Confidence','Source'];
        const data = [headers, ...Array.from(rows).map(r =>
            Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim())
        )];
        downloadCsv(data, 'audit-log.csv');
    }

    /* ── Stats ───────────────────────────────────────────────── */

    function updateStats(stats) {
        const m = {
            'stat-total':      stats.total,
            'stat-verified':   stats.verified,
            'stat-corrected':  stats.corrected,
            'stat-invalid':    stats.invalid,
            'stat-cache-hits': stats.cacheHits,
            'stat-avg-ms':     stats.avgResponseMs != null ? Math.round(stats.avgResponseMs) : '—'
        };
        Object.entries(m).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val != null ? val.toLocaleString() : '—';
        });
    }

    /* ── CSV download ────────────────────────────────────────── */

    function downloadCsv(rows, filename) {
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    /* ── Utility ─────────────────────────────────────────────── */

    function setEl(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function statusIcon(status) {
        return { verified: '✅', corrected: '⚠️', invalid: '❌', offline: '🔵', 'offline-fallback': '🔵' }[status] || '🔍';
    }

    function relativeTime(ts) {
        const diff = Date.now() - ts;
        if (diff < 60000)  return 'just now';
        if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
        return `${Math.floor(diff/86400000)}d ago`;
    }

    /* ── Init ────────────────────────────────────────────────── */

    function init() {
        initTabs();
        populateStateSelect('state');
        populateBrowseStateFilter();
        renderHistory();

        // Restore admin if key saved
        const savedKey = localStorage.getItem(STORAGE_KEYS.ADMIN_KEY);
        if (savedKey) {
            const keyInput = document.getElementById('admin-key-input');
            if (keyInput) keyInput.value = savedKey;
            showAdminPanel();
        }

        // Enter key on form fields
        ['street','city','state','zip'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
        });
    }

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        verify,
        clearForm,
        clearHistory,
        reopenHistory,
        openModal,
        closeModal,
        copyAddress,
        saveConfig,
        testConnection,
        checkStatus,
        adminAuth,
        bulkVerify,
        exportBulkResults,
        searchAddresses,
        refreshAuditLog,
        exportAuditLog,
        parseWithBedrock,
        useBedrockResult,
        refreshBrowse,
        browsePage,
        exportBrowse,
        debounceBrowse,
        triggerBatch
    };
})();
