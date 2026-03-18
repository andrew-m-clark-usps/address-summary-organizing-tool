/**
 * app.js — Core Application Logic
 * Handles file loading, UI state, analysis orchestration, CSV export, and PowerPoint export
 */

const App = (() => {

    // ===== STATE =====
    let state = {
        dataA: null,
        dataB: null,
        matchResults: null,
        analysis: null,
        currentTab: 'upload',
        matchedPage: 1,
        unmatchedAPage: 1,
        unmatchedBPage: 1,
        matchedFilter: { search: '', confidence: 'all', state: '' },
        matchedSort: { col: 'score', dir: 'desc' },
        threshold: 70,
        weights: { zip: 40, state: 30, city: 20, street: 10 }
    };

    const PAGE_SIZE = 50;

    // ===== FIELD DETECTION =====
    const STREET_FIELDS  = ['address', 'street', 'street address', 'address line 1', 'addr', 'street_address', 'streetaddress'];
    const CITY_FIELDS    = ['city', 'town', 'municipality'];
    const STATE_FIELDS   = ['state', 'st', 'province', 'state_code', 'statecode'];
    const ZIP_FIELDS     = ['zip', 'zip code', 'postal code', 'postalcode', 'zipcode', 'postal', 'zip_code'];

    function detectField(headers, candidates) {
        const lower = headers.map(h => h.toLowerCase().trim());
        for (const cand of candidates) {
            const idx = lower.indexOf(cand.toLowerCase());
            if (idx >= 0) return headers[idx];
        }
        return null;
    }

    function normalizeRecord(row, headers) {
        const streetField = detectField(headers, STREET_FIELDS);
        const cityField   = detectField(headers, CITY_FIELDS);
        const stateField  = detectField(headers, STATE_FIELDS);
        const zipField    = detectField(headers, ZIP_FIELDS);
        return {
            street: streetField ? (row[streetField] || '') : '',
            city:   cityField   ? (row[cityField]   || '') : '',
            state:  stateField  ? (row[stateField]  || '') : '',
            zip:    zipField    ? String(row[zipField] || '') : '',
            _raw: row
        };
    }

    // ===== FILE PARSING =====
    function parseCSV(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (!results.data || results.data.length === 0) {
                        reject(new Error('No data found in CSV file.'));
                        return;
                    }
                    const headers = results.meta.fields || [];
                    const records = results.data.map(row => normalizeRecord(row, headers));
                    resolve({ records, headers, raw: results.data });
                },
                error: (err) => reject(new Error('CSV parse error: ' + err.message))
            });
        });
    }

    function parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    const sheetName = wb.SheetNames[0];
                    const sheet = wb.Sheets[sheetName];
                    const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    if (!raw || raw.length === 0) {
                        reject(new Error('No data found in Excel file.'));
                        return;
                    }
                    const headers = raw.length > 0 ? Object.keys(raw[0]) : [];
                    const records = raw.map(row => normalizeRecord(row, headers));
                    resolve({ records, headers, raw });
                } catch (err) {
                    reject(new Error('Excel parse error: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('File read error.'));
            reader.readAsBinaryString(file);
        });
    }

    async function loadFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') return parseCSV(file);
        if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
        throw new Error('Unsupported file format. Use CSV or Excel (.xlsx/.xls).');
    }

    // ===== UI HELPERS =====
    function showTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
        const content = document.getElementById('tab-' + tabName);
        const tab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
        if (content) content.classList.add('active');
        if (tab) tab.classList.add('active');
        state.currentTab = tabName;
    }

    function showLandingPage() {
        document.getElementById('landing-page').style.display = '';
        document.getElementById('analysis-view').style.display = 'none';
        document.getElementById('header-landing-actions').style.display = '';
        document.getElementById('header-analysis-actions').style.display = 'none';
    }

    function showAnalysisView() {
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('analysis-view').style.display = '';
        document.getElementById('header-landing-actions').style.display = 'none';
        document.getElementById('header-analysis-actions').style.display = '';
        showTab('dashboard');
    }

    function showLoading(text, sub) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.querySelector('.loading-text').textContent = text || 'Processing…';
            const subEl = overlay.querySelector('.loading-sub');
            if (subEl) subEl.textContent = sub || '';
            overlay.classList.add('visible');
        }
    }

    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    function setProgress(id, pct, label) {
        const bar = document.getElementById(id + '-bar');
        const lbl = document.getElementById(id + '-label');
        if (bar) bar.style.width = pct + '%';
        if (lbl) lbl.textContent = label || Math.round(pct) + '%';
    }

    function showAlert(containerId, type, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `<div class="alert alert-${type}"><span>${getAlertIcon(type)}</span><span>${message}</span></div>`;
    }

    function clearAlert(containerId) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
    }

    function getAlertIcon(type) {
        return { success: '✅', info: 'ℹ️', warning: '⚠️', danger: '❌' }[type] || 'ℹ️';
    }

    function formatNumber(n) {
        return (n || 0).toLocaleString();
    }

    function getBadgeHtml(score) {
        const cls = AddressMatcher.getConfidenceBadgeClass(score);
        return `<span class="badge ${cls}">${score}%</span>`;
    }

    // ===== FILE UPLOAD HANDLERS =====
    function handleFileUpload(fileInput, system) {
        const file = fileInput.files[0];
        if (!file) return;
        const infoId = system === 'a' ? 'file-info-a' : 'file-info-b';
        const zoneId = system === 'a' ? 'upload-zone-a' : 'upload-zone-b';
        const alertId = system === 'a' ? 'upload-alert-a' : 'upload-alert-b';
        clearAlert(alertId);
        showLoading(`Loading ${system === 'a' ? 'System A' : 'System B'} file…`, file.name);
        loadFile(file)
            .then(result => {
                if (system === 'a') state.dataA = result;
                else state.dataB = result;
                hideLoading();
                const infoEl = document.getElementById(infoId);
                const zoneEl = document.getElementById(zoneId);
                if (infoEl) {
                    infoEl.textContent = `✅ Loaded: ${formatNumber(result.records.length)} records from "${file.name}"`;
                    infoEl.classList.add('visible');
                }
                if (zoneEl) zoneEl.classList.add('loaded');
                updateAnalyzeButton();
                showAlert(alertId, 'success', `Successfully loaded ${formatNumber(result.records.length)} records.`);
            })
            .catch(err => {
                hideLoading();
                showAlert(alertId, 'danger', err.message);
            });
    }

    function updateAnalyzeButton() {
        const btn = document.getElementById('btn-analyze');
        if (btn) {
            btn.disabled = !(state.dataA && state.dataB);
        }
    }

    // ===== ANALYSIS =====
    async function runAnalysis() {
        if (!state.dataA || !state.dataB) return;
        showLoading('Running address matching…', 'This may take a moment for large datasets');

        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const matchStart = Date.now();
            state.matchResults = AddressMatcher.matchRecords(
                state.dataA.records,
                state.dataB.records,
                {
                    threshold: state.threshold,
                    weights: state.weights,
                    onProgress: (done, total) => {
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        setProgress('match-progress', pct, `${formatNumber(done)} / ${formatNumber(total)} records`);
                    }
                }
            );
            const processingMs = Date.now() - matchStart;

            state.analysis = DataAnalyzer.runFullAnalysis(
                state.dataA.records,
                state.dataB.records,
                state.matchResults,
                processingMs
            );

            hideLoading();
            renderDashboard();
            showAnalysisView();
        } catch (err) {
            hideLoading();
            showAlert('analyze-alert', 'danger', 'Analysis failed: ' + err.message);
            console.error(err);
        }
    }

    // ===== DASHBOARD RENDERING =====
    function renderDashboard() {
        if (!state.analysis) return;
        const { summary, quality, geo, cities } = state.analysis;

        // Update stat cards
        setStatCard('stat-total-a',    formatNumber(summary.totalA));
        setStatCard('stat-total-b',    formatNumber(summary.totalB));
        setStatCard('stat-matched',    formatNumber(summary.matched));
        setStatCard('stat-match-pct',  summary.matchPct + '%');
        setStatCard('stat-perfect',    formatNumber(summary.perfect));
        setStatCard('stat-high',       formatNumber(summary.high));
        setStatCard('stat-partial',    formatNumber(summary.partial));
        setStatCard('stat-unmatched-a', formatNumber(summary.unmatchedA));
        setStatCard('stat-unmatched-b', formatNumber(summary.unmatchedB));

        // Render all charts
        Visualizations.renderAll(state.analysis);

        // Render geo table
        renderGeoTable();
        renderQualitySection();
        renderMatchedTable();
        renderUnmatchedATable();
        renderUnmatchedBTable();

        // Render AI metrics
        renderAIMetrics();
        renderDashboardAIInsights();
    }

    function setStatCard(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ===== GEO TABLE =====
    function renderGeoTable() {
        if (!state.analysis) return;
        const { geo } = state.analysis;
        renderSimpleTable('geo-state-table', ['State', 'Sys A', 'Sys B'],
            geo.stateA.slice(0, 20).map(s => {
                const bEntry = geo.stateB.find(b => b.state === s.state);
                return [s.state, formatNumber(s.count), formatNumber(bEntry ? bEntry.count : 0)];
            }));
        renderSimpleTable('geo-city-table', ['City', 'Sys A Count', 'Sys B Count'],
            state.analysis.cities.slice(0, 20).map(c => [c.city, formatNumber(c.countA), formatNumber(c.countB)]));
    }

    function renderSimpleTable(id, headers, rows) {
        const el = document.getElementById(id);
        if (!el) return;
        let html = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
        if (rows.length === 0) {
            html += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text-muted)">No data</td></tr>`;
        } else {
            rows.forEach(row => {
                html += '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
            });
        }
        html += '</tbody></table>';
        el.innerHTML = html;
    }

    // ===== QUALITY SECTION =====
    function renderQualitySection() {
        if (!state.analysis) return;
        const { quality } = state.analysis;
        renderFieldBars('quality-fields-a', quality.a.fieldCompleteness);
        renderFieldBars('quality-fields-b', quality.b.fieldCompleteness);
        setStatCard('qual-complete-a', formatNumber(quality.a.complete));
        setStatCard('qual-complete-b', formatNumber(quality.b.complete));
        setStatCard('qual-incomplete-a', formatNumber(quality.a.incomplete));
        setStatCard('qual-incomplete-b', formatNumber(quality.b.incomplete));
        setStatCard('qual-invalid-zip-a', formatNumber(quality.a.invalidZip));
        setStatCard('qual-invalid-zip-b', formatNumber(quality.b.invalidZip));
        setStatCard('qual-dupes-a', formatNumber(quality.a.duplicates));
        setStatCard('qual-dupes-b', formatNumber(quality.b.duplicates));
    }

    function renderFieldBars(containerId, completeness) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const fields = ['street', 'city', 'state', 'zip'];
        const names  = ['Street', 'City', 'State', 'ZIP'];
        el.innerHTML = fields.map((f, i) => `
            <div class="field-bar">
                <span class="field-name">${names[i]}</span>
                <div class="field-bar-track"><div class="field-bar-fill" style="width:${completeness[f]}%"></div></div>
                <span class="field-pct">${completeness[f]}%</span>
            </div>
        `).join('');
    }

    // ===== AI METRICS RENDERING =====
    function getMetricClass(value, thresholds) {
        // thresholds: { excellent, good, fair } — values above = that tier
        if (value >= (thresholds.excellent || 90)) return 'metric-excellent';
        if (value >= (thresholds.good    || 70)) return 'metric-good';
        if (value >= (thresholds.fair    || 50)) return 'metric-fair';
        return 'metric-poor';
    }

    function metricCard(id, label, value, explain, colorClass) {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'metric-card ' + (colorClass || '');
        el.innerHTML = `
            <div class="metric-value">${value}</div>
            <div class="metric-label">${label}</div>
            ${explain ? `<div class="metric-explain">${explain}</div>` : ''}
        `;
    }

    function renderAIMetrics() {
        if (!state.analysis || !state.analysis.aiMetrics) return;
        const { aiMetrics, matchDetails, summary } = state.analysis;

        // AI Performance Overview
        metricCard('ai-precision', 'Precision', aiMetrics.precision + '%',
            'True matches / (true + false positives)',
            getMetricClass(aiMetrics.precision, { excellent: 90, good: 75, fair: 60 }));
        metricCard('ai-recall', 'Recall', aiMetrics.recall + '%',
            'Matched / min(total A, total B)',
            getMetricClass(aiMetrics.recall, { excellent: 90, good: 75, fair: 60 }));
        metricCard('ai-f1', 'F1 Score', aiMetrics.f1Score + '%',
            'Harmonic mean of precision & recall',
            getMetricClass(aiMetrics.f1Score, { excellent: 90, good: 75, fair: 60 }));
        metricCard('ai-accuracy', 'Accuracy', aiMetrics.accuracy + '%',
            'High-confidence matches / total matched',
            getMetricClass(aiMetrics.accuracy, { excellent: 80, good: 60, fair: 40 }));
        metricCard('ai-confidence', 'Confidence Index', aiMetrics.overallConfidence + '%',
            'Weighted composite of score, match rate & DQ',
            getMetricClass(aiMetrics.overallConfidence, { excellent: 85, good: 70, fair: 55 }));
        metricCard('ai-jaccard', 'Jaccard Index', aiMetrics.jaccardIndex + '%',
            'Intersection / union of both datasets',
            getMetricClass(aiMetrics.jaccardIndex, { excellent: 70, good: 50, fair: 30 }));

        // Data Quality Scores
        metricCard('ai-dq-a', 'DQ Score — System A', aiMetrics.dqScoreA.toFixed(1) + '%',
            'Completeness, validity & duplicate penalty',
            getMetricClass(aiMetrics.dqScoreA, { excellent: 90, good: 75, fair: 60 }));
        metricCard('ai-dq-b', 'DQ Score — System B', aiMetrics.dqScoreB.toFixed(1) + '%',
            'Completeness, validity & duplicate penalty',
            getMetricClass(aiMetrics.dqScoreB, { excellent: 90, good: 75, fair: 60 }));

        // Match Score Statistics
        if (matchDetails) {
            setStatCard('ai-avg-score',    matchDetails.avgMatchScore.toFixed(1) + '%');
            setStatCard('ai-median-score', matchDetails.medianMatchScore.toFixed(1) + '%');
            setStatCard('ai-stddev-score', matchDetails.stdDevMatchScore.toFixed(1));
            setStatCard('ai-min-score',    matchDetails.minMatchScore + '%');
            setStatCard('ai-max-score',    matchDetails.maxMatchScore + '%');
            setStatCard('ai-p10',          matchDetails.scorePercentiles.p10 + '%');
            setStatCard('ai-p25',          matchDetails.scorePercentiles.p25 + '%');
            setStatCard('ai-p50',          matchDetails.scorePercentiles.p50 + '%');
            setStatCard('ai-p75',          matchDetails.scorePercentiles.p75 + '%');
            setStatCard('ai-p90',          matchDetails.scorePercentiles.p90 + '%');

            // Per-component scores
            setStatCard('ai-street-score', matchDetails.avgStreetScore.toFixed(1) + '%');
            setStatCard('ai-city-score',   matchDetails.avgCityScore.toFixed(1)   + '%');
            setStatCard('ai-state-score',  matchDetails.avgStateScore.toFixed(1)  + '%');
            setStatCard('ai-zip-score',    matchDetails.avgZipScore.toFixed(1)    + '%');

            // Match type counts
            setStatCard('ai-exact-count', formatNumber(matchDetails.exactMatchCount));
            setStatCard('ai-fuzzy-count', formatNumber(matchDetails.fuzzyMatchCount));

            // Cross-field
            setStatCard('ai-cross-state', formatNumber(matchDetails.crossStateMatchCount));
            setStatCard('ai-cross-zip',   formatNumber(matchDetails.crossZipMatchCount));
            setStatCard('ai-cross-city',  formatNumber(matchDetails.crossCityMatchCount));
            setStatCard('ai-disc-rate',   matchDetails.discrepancyRate + '%');
            setStatCard('ai-avg-disc',    matchDetails.avgDiscrepanciesPerMatch.toFixed(2));
            setStatCard('ai-secondary-unit', formatNumber(matchDetails.matchedWithSecondaryUnit));
        }

        // Risk & Anomaly
        metricCard('ai-fp-risk', 'False Positive Risk', aiMetrics.falsePositiveRisk + '%',
            'Borderline matches near threshold',
            getMetricClass(100 - aiMetrics.falsePositiveRisk, { excellent: 85, good: 70, fair: 55 }));
        metricCard('ai-anomaly', 'Anomaly Rate', aiMetrics.anomalyRate + '%',
            'Duplicate or invalid ZIP/state records',
            getMetricClass(100 - aiMetrics.anomalyRate, { excellent: 95, good: 85, fair: 70 }));
        metricCard('ai-entropy', 'Entropy', aiMetrics.entropy.toFixed(2),
            'Shannon entropy of score distribution (0–3.32)',
            '');
        metricCard('ai-gini', 'Gini Coefficient', aiMetrics.giniCoefficient.toFixed(3),
            'Score inequality (0=equal, 1=max inequality)',
            '');

        // Confidence Band
        if (matchDetails) {
            setStatCard('ai-band-lower', matchDetails.scorePercentiles.p10 + '%');
            setStatCard('ai-band-mid',   matchDetails.scorePercentiles.p50 + '%');
            setStatCard('ai-band-upper', matchDetails.scorePercentiles.p90 + '%');
            renderConfidenceBandVisual(matchDetails.scorePercentiles);
        }

        // Geographic similarity
        metricCard('ai-cosine', 'Cosine Similarity', aiMetrics.cosineSimilarity + '%',
            'Geographic state-vector similarity between datasets',
            getMetricClass(aiMetrics.cosineSimilarity, { excellent: 90, good: 75, fair: 50 }));

        // Processing efficiency
        setStatCard('ai-processing-eff', aiMetrics.processingEfficiency > 0
            ? formatNumber(Math.round(aiMetrics.processingEfficiency)) + ' rec/s'
            : 'N/A');

        // Coverage rates
        setStatCard('ai-coverage-a', aiMetrics.coverageRateA.toFixed(1) + '%');
        setStatCard('ai-coverage-b', aiMetrics.coverageRateB.toFixed(1) + '%');

        // Render AI charts
        if (matchDetails) {
            Visualizations.renderMatchTypeDonut(matchDetails);
            Visualizations.renderComponentScoresBar(matchDetails);
            Visualizations.renderConfidenceBandChart(matchDetails);
        }
        Visualizations.renderDQComparisonBar(aiMetrics);
    }

    function renderConfidenceBandVisual(percentiles) {
        const el = document.getElementById('confidence-band-visual');
        if (!el) return;
        const { p10, p25, p50, p75, p90 } = percentiles;
        el.innerHTML = `
            <div class="confidence-band-track">
                <div class="confidence-band-range" style="left:${p10}%;width:${p90 - p10}%"></div>
                <div class="confidence-band-iqr" style="left:${p25}%;width:${p75 - p25}%"></div>
                <div class="confidence-band-median" style="left:${p50}%"></div>
            </div>
            <div class="confidence-band-labels">
                <span style="left:${p10}%">P10: ${p10}%</span>
                <span style="left:${p25}%">P25: ${p25}%</span>
                <span style="left:${p50}%">P50: ${p50}%</span>
                <span style="left:${p75}%">P75: ${p75}%</span>
                <span style="left:${p90}%">P90: ${p90}%</span>
            </div>
        `;
    }

    function renderDashboardAIInsights() {
        if (!state.analysis || !state.analysis.aiMetrics) return;
        const { aiMetrics } = state.analysis;

        setStatCard('dash-ai-confidence', aiMetrics.overallConfidence + '%');
        setStatCard('dash-ai-f1',         aiMetrics.f1Score + '%');
        setStatCard('dash-ai-dq-a',       aiMetrics.dqScoreA.toFixed(1) + '%');
        setStatCard('dash-ai-dq-b',       aiMetrics.dqScoreB.toFixed(1) + '%');
    }

    // ===== MATCHED TABLE =====
    function getFilteredMatched() {
        if (!state.matchResults) return [];
        let rows = state.matchResults.matched;
        const { search, confidence, state: stateFilter } = state.matchedFilter;
        if (search) {
            const s = search.toLowerCase();
            rows = rows.filter(m =>
                (m.recordA.street || '').toLowerCase().includes(s) ||
                (m.recordA.city   || '').toLowerCase().includes(s) ||
                (m.recordB.street || '').toLowerCase().includes(s) ||
                (m.recordB.city   || '').toLowerCase().includes(s)
            );
        }
        if (confidence && confidence !== 'all') {
            rows = rows.filter(m => AddressMatcher.getConfidenceLabel(m.score) === confidence);
        }
        if (stateFilter) {
            const sf = stateFilter.toUpperCase();
            rows = rows.filter(m =>
                (m.recordA.state || '').toUpperCase() === sf ||
                (m.recordB.state || '').toUpperCase() === sf
            );
        }
        // Sort
        const { col, dir } = state.matchedSort;
        rows = [...rows].sort((a, b) => {
            let va, vb;
            if (col === 'score') { va = a.score; vb = b.score; }
            else if (col === 'stateA') { va = a.recordA.state || ''; vb = b.recordA.state || ''; }
            else if (col === 'cityA') { va = a.recordA.city || ''; vb = b.recordA.city || ''; }
            else { va = a.score; vb = b.score; }
            if (typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
            return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        return rows;
    }

    function renderMatchedTable() {
        const rows = getFilteredMatched();
        const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        if (state.matchedPage > totalPages) state.matchedPage = 1;
        const start = (state.matchedPage - 1) * PAGE_SIZE;
        const page = rows.slice(start, start + PAGE_SIZE);
        const tbody = document.getElementById('matched-tbody');
        if (!tbody) return;
        if (page.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted)">No records match the current filter.</td></tr>';
        } else {
            tbody.innerHTML = page.map(m => `
                <tr>
                    <td>${getBadgeHtml(m.score)}</td>
                    <td>${esc(m.recordA.street)}</td>
                    <td>${esc(m.recordA.city)}</td>
                    <td>${esc(m.recordA.state)}</td>
                    <td>${esc(m.recordA.zip)}</td>
                    <td>${esc(m.recordB.street)}</td>
                    <td>${esc(m.recordB.city)}</td>
                    <td>${esc(m.recordB.state)}</td>
                    <td>${esc(m.recordB.zip)}</td>
                </tr>
            `).join('');
        }
        renderPagination('matched-pagination', state.matchedPage, totalPages, (p) => {
            state.matchedPage = p; renderMatchedTable();
        });
        document.getElementById('matched-count').textContent = formatNumber(rows.length) + ' records';
    }

    function renderUnmatchedATable() {
        renderUnmatchedTable('unmatched-a-tbody', 'unmatched-a-pagination', 'unmatched-a-count',
            state.matchResults ? state.matchResults.unmatchedA : [],
            state.unmatchedAPage, (p) => { state.unmatchedAPage = p; renderUnmatchedATable(); });
    }

    function renderUnmatchedBTable() {
        renderUnmatchedTable('unmatched-b-tbody', 'unmatched-b-pagination', 'unmatched-b-count',
            state.matchResults ? state.matchResults.unmatchedB : [],
            state.unmatchedBPage, (p) => { state.unmatchedBPage = p; renderUnmatchedBTable(); });
    }

    function renderUnmatchedTable(tbodyId, pagId, countId, records, currentPage, onPage) {
        const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = 1;
        const start = (currentPage - 1) * PAGE_SIZE;
        const page = records.slice(start, start + PAGE_SIZE);
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        if (page.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">No unmatched records.</td></tr>';
        } else {
            tbody.innerHTML = page.map(rec => `
                <tr>
                    <td>${esc(rec.street)}</td>
                    <td>${esc(rec.city)}</td>
                    <td>${esc(rec.state)}</td>
                    <td>${esc(rec.zip)}</td>
                </tr>
            `).join('');
        }
        renderPagination(pagId, currentPage, totalPages, onPage);
        const countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = formatNumber(records.length) + ' records';
    }

    function renderPagination(containerId, currentPage, totalPages, onPage) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const maxBtns = 7;
        let start = Math.max(1, currentPage - 3);
        let end = Math.min(totalPages, start + maxBtns - 1);
        start = Math.max(1, end - maxBtns + 1);
        let html = `<span>Page ${currentPage} of ${totalPages}</span><div class="pagination-controls">`;
        html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
        html += '</div>';
        el.innerHTML = html;
        el.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (!isNaN(p) && p >= 1 && p <= totalPages) onPage(p);
            });
        });
    }

    function esc(str) {
        if (!str) return '<span style="color:var(--text-muted)">—</span>';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ===== CSV EXPORT =====
    function recordsToCsvRows(records) {
        return records.map(r => [r.street, r.city, r.state, r.zip]);
    }

    function exportMatchedCsv() {
        if (!state.matchResults) return;
        const rows = [['Score', 'Street_A', 'City_A', 'State_A', 'ZIP_A', 'Street_B', 'City_B', 'State_B', 'ZIP_B', 'Discrepancies']];
        state.matchResults.matched.forEach(m => {
            rows.push([
                m.score, m.recordA.street, m.recordA.city, m.recordA.state, m.recordA.zip,
                m.recordB.street, m.recordB.city, m.recordB.state, m.recordB.zip,
                m.discrepancies.join('; ')
            ]);
        });
        downloadCsv(rows, 'matched_records.csv');
    }

    function exportUnmatchedACsv() {
        if (!state.matchResults) return;
        const rows = [['Street', 'City', 'State', 'ZIP'], ...recordsToCsvRows(state.matchResults.unmatchedA)];
        downloadCsv(rows, 'unmatched_system_a.csv');
    }

    function exportUnmatchedBCsv() {
        if (!state.matchResults) return;
        const rows = [['Street', 'City', 'State', 'ZIP'], ...recordsToCsvRows(state.matchResults.unmatchedB)];
        downloadCsv(rows, 'unmatched_system_b.csv');
    }

    function exportSummaryCsv() {
        if (!state.analysis) return;
        const { summary, quality, matchDetails, aiMetrics } = state.analysis;
        const rows = [
            ['Metric', 'Value'],
            ['Total Records System A', summary.totalA],
            ['Total Records System B', summary.totalB],
            ['Matched Records', summary.matched],
            ['Match Rate', summary.matchPct + '%'],
            ['Perfect Matches (100%)', summary.perfect],
            ['High Confidence (90-99%)', summary.high],
            ['Partial Matches (70-89%)', summary.partial],
            ['Low Confidence (50-69%)', summary.low],
            ['No Match (<50%)', summary.veryLow],
            ['Unmatched in System A', summary.unmatchedA],
            ['Unmatched in System B', summary.unmatchedB],
            [''],
            ['Address Quality - System A', ''],
            ['Complete Addresses', quality.a.complete],
            ['Incomplete Addresses', quality.a.incomplete],
            ['Invalid ZIP Codes', quality.a.invalidZip],
            ['Duplicate Addresses', quality.a.duplicates],
            ['Avg Fields Populated', quality.a.avgFieldsPopulated],
            ['Records w/ Secondary Unit (APT/STE)', quality.a.recordsWithSecondaryUnit],
            ['ZIP+4 Count', quality.a.hasZipPlus4Count],
            ['Standardized Street %', quality.a.standardizedStreetPct + '%'],
            [''],
            ['Address Quality - System B', ''],
            ['Complete Addresses', quality.b.complete],
            ['Incomplete Addresses', quality.b.incomplete],
            ['Invalid ZIP Codes', quality.b.invalidZip],
            ['Duplicate Addresses', quality.b.duplicates],
            ['Avg Fields Populated', quality.b.avgFieldsPopulated],
            ['Records w/ Secondary Unit (APT/STE)', quality.b.recordsWithSecondaryUnit],
            ['ZIP+4 Count', quality.b.hasZipPlus4Count],
            ['Standardized Street %', quality.b.standardizedStreetPct + '%'],
        ];
        if (matchDetails) {
            rows.push(['']);
            rows.push(['Match Score Statistics', '']);
            rows.push(['Average Match Score', matchDetails.avgMatchScore + '%']);
            rows.push(['Median Match Score', matchDetails.medianMatchScore + '%']);
            rows.push(['Std Dev Match Score', matchDetails.stdDevMatchScore]);
            rows.push(['Min Match Score', matchDetails.minMatchScore + '%']);
            rows.push(['Max Match Score', matchDetails.maxMatchScore + '%']);
            rows.push(['P10 Score', matchDetails.scorePercentiles.p10 + '%']);
            rows.push(['P25 Score', matchDetails.scorePercentiles.p25 + '%']);
            rows.push(['P50 Score', matchDetails.scorePercentiles.p50 + '%']);
            rows.push(['P75 Score', matchDetails.scorePercentiles.p75 + '%']);
            rows.push(['P90 Score', matchDetails.scorePercentiles.p90 + '%']);
            rows.push(['Avg Street Component Score', matchDetails.avgStreetScore + '%']);
            rows.push(['Avg City Component Score', matchDetails.avgCityScore + '%']);
            rows.push(['Avg State Component Score', matchDetails.avgStateScore + '%']);
            rows.push(['Avg ZIP Component Score', matchDetails.avgZipScore + '%']);
            rows.push(['Exact Matches', matchDetails.exactMatchCount]);
            rows.push(['Fuzzy Matches', matchDetails.fuzzyMatchCount]);
            rows.push(['Cross-State Matches', matchDetails.crossStateMatchCount]);
            rows.push(['Cross-ZIP Matches', matchDetails.crossZipMatchCount]);
            rows.push(['Cross-City Matches', matchDetails.crossCityMatchCount]);
            rows.push(['Discrepancy Rate', matchDetails.discrepancyRate + '%']);
            rows.push(['Avg Discrepancies/Match', matchDetails.avgDiscrepanciesPerMatch]);
            rows.push(['Matched w/ Secondary Unit', matchDetails.matchedWithSecondaryUnit]);
        }
        if (aiMetrics) {
            rows.push(['']);
            rows.push(['AI / ML Metrics', '']);
            rows.push(['Precision', aiMetrics.precision + '%']);
            rows.push(['Recall', aiMetrics.recall + '%']);
            rows.push(['F1 Score', aiMetrics.f1Score + '%']);
            rows.push(['Accuracy', aiMetrics.accuracy + '%']);
            rows.push(['Jaccard Index', aiMetrics.jaccardIndex + '%']);
            rows.push(['DQ Score System A', aiMetrics.dqScoreA + '%']);
            rows.push(['DQ Score System B', aiMetrics.dqScoreB + '%']);
            rows.push(['Overall Confidence Index', aiMetrics.overallConfidence + '%']);
            rows.push(['Shannon Entropy', aiMetrics.entropy]);
            rows.push(['Gini Coefficient', aiMetrics.giniCoefficient]);
            rows.push(['Coverage Rate A', aiMetrics.coverageRateA + '%']);
            rows.push(['Coverage Rate B', aiMetrics.coverageRateB + '%']);
            rows.push(['False Positive Risk', aiMetrics.falsePositiveRisk + '%']);
            rows.push(['Anomaly Rate', aiMetrics.anomalyRate + '%']);
            rows.push(['Cosine Similarity', aiMetrics.cosineSimilarity + '%']);
            rows.push(['Processing Efficiency', aiMetrics.processingEfficiency + ' rec/s']);
            rows.push(['Confidence Band Lower (P10)', aiMetrics.modelConfidenceBand.lower + '%']);
            rows.push(['Confidence Band Mid (P50)', aiMetrics.modelConfidenceBand.mid + '%']);
            rows.push(['Confidence Band Upper (P90)', aiMetrics.modelConfidenceBand.upper + '%']);
        }
        downloadCsv(rows, 'analysis_summary.csv');
    }

    function downloadCsv(rows, filename) {
        const csv = rows.map(r => r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ===== POWERPOINT EXPORT =====
    async function exportPowerPoint() {
        if (!state.analysis) {
            showAlert('export-alert', 'warning', 'Please run analysis before exporting to PowerPoint.');
            return;
        }
        showLoading('Building PowerPoint presentation…', 'Capturing charts and generating slides');
        await new Promise(r => setTimeout(r, 100));

        try {
            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"

            // Color theme
            const ACCENT  = '3B82F6';
            const DARK    = '0F172A';
            const SURFACE = '1E293B';
            const TEXT    = 'F1F5F9';
            const MUTED   = '94A3B8';
            const GREEN   = '10B981';
            const AMBER   = 'F59E0B';
            const RED     = 'EF4444';
            const PURPLE  = '8B5CF6';

            const { summary, quality, geo, cities } = state.analysis;
            const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            // ── Helpers ──────────────────────────────────────────────────────
            function addBg(slide, color) {
                slide.background = { color: color || DARK };
            }

            function addTitle(slide, title, sub) {
                slide.addText(title, {
                    x: 0.4, y: 0.2, w: 12.5, h: 0.6,
                    fontSize: 24, bold: true, color: TEXT, fontFace: 'Calibri'
                });
                if (sub) {
                    slide.addText(sub, {
                        x: 0.4, y: 0.85, w: 12.5, h: 0.3,
                        fontSize: 13, color: MUTED, fontFace: 'Calibri'
                    });
                }
                // Accent line
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0.4, y: 1.15, w: 12.5, h: 0.04,
                    fill: { color: ACCENT }
                });
            }

            function pct(n, d) {
                return d > 0 ? Math.round((n / d) * 100) : 0;
            }

            function statBox(slide, x, y, w, h, label, value, barColor) {
                slide.addShape(pptx.ShapeType.rect, {
                    x, y, w, h, fill: { color: SURFACE }, line: { color: '334155', width: 0.5 }, rounding: 0.1
                });
                slide.addText(String(value), {
                    x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h * 0.55,
                    fontSize: 22, bold: true, color: TEXT, align: 'center', fontFace: 'Calibri'
                });
                slide.addText(label, {
                    x: x + 0.1, y: y + h * 0.6, w: w - 0.2, h: h * 0.35,
                    fontSize: 10, color: MUTED, align: 'center', fontFace: 'Calibri'
                });
                if (barColor) {
                    slide.addShape(pptx.ShapeType.rect, {
                        x, y: y + h - 0.05, w, h: 0.05, fill: { color: barColor }
                    });
                }
            }

            // ── Slide 1: Title ────────────────────────────────────────────────
            const slideTitle = pptx.addSlide();
            addBg(slideTitle, DARK);
            // Large gradient-ish background block
            slideTitle.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: DARK } });
            slideTitle.addShape(pptx.ShapeType.rect, { x: 0, y: 5.5, w: 13.33, h: 2.0, fill: { color: SURFACE } });
            slideTitle.addText('📊 Address Summary Organizing Tool', {
                x: 1, y: 1.5, w: 11.3, h: 1,
                fontSize: 32, bold: true, color: TEXT, align: 'center', fontFace: 'Calibri'
            });
            slideTitle.addText('Analysis Breakdown Report', {
                x: 1, y: 2.65, w: 11.3, h: 0.6,
                fontSize: 20, color: MUTED, align: 'center', fontFace: 'Calibri'
            });
            slideTitle.addShape(pptx.ShapeType.rect, {
                x: 4.5, y: 3.4, w: 4.33, h: 0.06, fill: { color: ACCENT }
            });
            slideTitle.addText(`System A: ${formatNumber(summary.totalA)} records  |  System B: ${formatNumber(summary.totalB)} records`, {
                x: 1, y: 3.65, w: 11.3, h: 0.4,
                fontSize: 13, color: MUTED, align: 'center', fontFace: 'Calibri'
            });
            slideTitle.addText(`Generated: ${now}`, {
                x: 1, y: 6.0, w: 11.3, h: 0.35,
                fontSize: 12, color: MUTED, align: 'center', fontFace: 'Calibri'
            });

            // ── Slide 2: Match Summary Stats ──────────────────────────────────
            const slideStats = pptx.addSlide();
            addBg(slideStats);
            addTitle(slideStats, 'Match Summary', `Analysis of ${formatNumber(summary.totalA)} System A records vs ${formatNumber(summary.totalB)} System B records`);

            const boxW = 1.9, boxH = 1.1, gap = 0.15;
            const startX = 0.5;
            const row1Y = 1.4;
            const boxes = [
                { label: 'System A Total',  value: formatNumber(summary.totalA),    color: ACCENT },
                { label: 'System B Total',  value: formatNumber(summary.totalB),    color: PURPLE },
                { label: 'Matched',         value: formatNumber(summary.matched),   color: GREEN },
                { label: 'Match Rate',      value: summary.matchPct + '%',          color: GREEN },
                { label: 'Unmatched A',     value: formatNumber(summary.unmatchedA), color: ACCENT },
                { label: 'Unmatched B',     value: formatNumber(summary.unmatchedB), color: PURPLE }
            ];
            boxes.forEach((b, i) => {
                statBox(slideStats, startX + i * (boxW + gap), row1Y, boxW, boxH, b.label, b.value, b.color);
            });

            const row2Y = row1Y + boxH + 0.3;
            const boxes2 = [
                { label: 'Perfect (100%)',   value: formatNumber(summary.perfect), color: GREEN },
                { label: 'High (90-99%)',    value: formatNumber(summary.high),    color: '84CC16' },
                { label: 'Partial (70-89%)', value: formatNumber(summary.partial), color: AMBER },
                { label: 'Low (50-69%)',     value: formatNumber(summary.low),     color: 'F97316' },
                { label: 'No Match (<50%)',  value: formatNumber(summary.veryLow), color: RED },
            ];
            boxes2.forEach((b, i) => {
                statBox(slideStats, startX + i * (boxW + gap), row2Y, boxW, boxH, b.label, b.value, b.color);
            });

            // Match rate bar
            const barY = row2Y + boxH + 0.35;
            slideStats.addText(`Overall Match Rate: ${summary.matchPct}%`, {
                x: 0.5, y: barY, w: 4, h: 0.35,
                fontSize: 13, color: TEXT, fontFace: 'Calibri', bold: true
            });
            const barW = 12.33;
            slideStats.addShape(pptx.ShapeType.rect, { x: 0.5, y: barY + 0.4, w: barW, h: 0.25, fill: { color: '334155' }, rounding: 0.05 });
            slideStats.addShape(pptx.ShapeType.rect, { x: 0.5, y: barY + 0.4, w: barW * (summary.matchPct / 100), h: 0.25, fill: { color: GREEN }, rounding: 0.05 });

            // ── Slide 3: Match Distribution Chart ────────────────────────────
            const slideMatchDist = pptx.addSlide();
            addBg(slideMatchDist);
            addTitle(slideMatchDist, 'Match Distribution', 'Breakdown of records by match confidence level');

            const distUrl = Visualizations.getChartDataUrl('chart-match-dist');
            if (distUrl) {
                slideMatchDist.addImage({ data: distUrl, x: 1.2, y: 1.3, w: 5, h: 5 });
            }
            // Legend / text breakdown
            const distItems = [
                { label: 'Perfect Match (100%)',    value: summary.perfect,  pct: pct(summary.perfect, summary.matched),  color: GREEN },
                { label: 'High Confidence (90-99%)',value: summary.high,     pct: pct(summary.high, summary.matched),     color: '84CC16' },
                { label: 'Partial Match (70-89%)',  value: summary.partial,  pct: pct(summary.partial, summary.matched),  color: AMBER },
                { label: 'Low Confidence (50-69%)', value: summary.low,      pct: pct(summary.low, summary.matched),      color: 'F97316' },
                { label: 'No Match (<50%)',          value: summary.veryLow, pct: pct(summary.veryLow, summary.matched),  color: RED },
            ];
            distItems.forEach((item, i) => {
                const iy = 1.5 + i * 0.72;
                slideMatchDist.addShape(pptx.ShapeType.rect, { x: 7.2, y: iy, w: 0.18, h: 0.18, fill: { color: item.color }, rounding: 0.05 });
                slideMatchDist.addText(`${item.label}`, { x: 7.5, y: iy - 0.02, w: 3.5, h: 0.25, fontSize: 11, color: TEXT, fontFace: 'Calibri' });
                slideMatchDist.addText(`${formatNumber(item.value)} records (${item.pct}%)`, { x: 7.5, y: iy + 0.22, w: 3.5, h: 0.2, fontSize: 10, color: MUTED, fontFace: 'Calibri' });
            });

            // ── Slide 4: Confidence Histogram ─────────────────────────────────
            const slideHist = pptx.addSlide();
            addBg(slideHist);
            addTitle(slideHist, 'Match Confidence Distribution', 'Number of records by confidence score range');
            const histUrl = Visualizations.getChartDataUrl('chart-confidence-hist');
            if (histUrl) {
                slideHist.addImage({ data: histUrl, x: 0.5, y: 1.3, w: 12.3, h: 5.5 });
            }

            // ── Slide 5: Geographic Breakdown ─────────────────────────────────
            const slideGeo = pptx.addSlide();
            addBg(slideGeo);
            addTitle(slideGeo, 'Geographic Breakdown', 'Top states by record volume — matched vs unmatched');
            const statesUrl = Visualizations.getChartDataUrl('chart-states');
            if (statesUrl) {
                slideGeo.addImage({ data: statesUrl, x: 0.5, y: 1.3, w: 12.3, h: 5.5 });
            }

            // ── Slide 6: Top Cities ────────────────────────────────────────────
            const slideCities = pptx.addSlide();
            addBg(slideCities);
            addTitle(slideCities, 'Top Cities Comparison', 'Record volume by city — System A vs System B');
            const citiesUrl = Visualizations.getChartDataUrl('chart-cities');
            if (citiesUrl) {
                slideCities.addImage({ data: citiesUrl, x: 0.5, y: 1.3, w: 6.1, h: 5.5 });
            }
            // City table (top 10)
            const topCities = cities.slice(0, 10);
            const tblData = [
                [
                    { text: 'City', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
                    { text: 'Sys A', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
                    { text: 'Sys B', options: { bold: true, color: TEXT, fill: { color: ACCENT } } }
                ],
                ...topCities.map(c => [
                    { text: c.city, options: { color: TEXT } },
                    { text: formatNumber(c.countA), options: { color: '93C5FD', align: 'center' } },
                    { text: formatNumber(c.countB), options: { color: 'C4B5FD', align: 'center' } }
                ])
            ];
            slideCities.addTable(tblData, {
                x: 7, y: 1.4, w: 6.0, h: 5.4,
                fontSize: 11, fontFace: 'Calibri',
                rowH: 0.42,
                border: { color: '334155', pt: 0.5 },
                fill: { color: SURFACE }
            });

            // ── Slide 7: Address Quality ───────────────────────────────────────
            const slideQuality = pptx.addSlide();
            addBg(slideQuality);
            addTitle(slideQuality, 'Address Quality Analysis', 'Completeness and validity metrics per system');
            const qualUrl = Visualizations.getChartDataUrl('chart-quality');
            if (qualUrl) {
                slideQuality.addImage({ data: qualUrl, x: 0.5, y: 1.3, w: 5, h: 5 });
            }
            // Quality metrics table
            const qMetrics = [
                [{ text: 'Metric', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
                 { text: 'System A', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
                 { text: 'System B', options: { bold: true, color: TEXT, fill: { color: ACCENT } } }],
                ...([
                    ['Complete Addresses', formatNumber(quality.a.complete), formatNumber(quality.b.complete)],
                    ['Incomplete Addresses', formatNumber(quality.a.incomplete), formatNumber(quality.b.incomplete)],
                    ['Missing ZIP', formatNumber(quality.a.missingZip), formatNumber(quality.b.missingZip)],
                    ['Missing City', formatNumber(quality.a.missingCity), formatNumber(quality.b.missingCity)],
                    ['Missing State', formatNumber(quality.a.missingState), formatNumber(quality.b.missingState)],
                    ['Invalid ZIP', formatNumber(quality.a.invalidZip), formatNumber(quality.b.invalidZip)],
                    ['Duplicate Addresses', formatNumber(quality.a.duplicates), formatNumber(quality.b.duplicates)],
                    ['Street Complete %', quality.a.fieldCompleteness.street + '%', quality.b.fieldCompleteness.street + '%'],
                    ['City Complete %', quality.a.fieldCompleteness.city + '%', quality.b.fieldCompleteness.city + '%'],
                    ['State Complete %', quality.a.fieldCompleteness.state + '%', quality.b.fieldCompleteness.state + '%'],
                    ['ZIP Complete %', quality.a.fieldCompleteness.zip + '%', quality.b.fieldCompleteness.zip + '%'],
                ].map(r => r.map((c, i) => ({ text: c, options: { color: i === 0 ? MUTED : TEXT } }))))
            ];
            slideQuality.addTable(qMetrics, {
                x: 6.5, y: 1.4, w: 6.5, h: 5.8,
                fontSize: 11, fontFace: 'Calibri',
                rowH: 0.44,
                border: { color: '334155', pt: 0.5 },
                fill: { color: SURFACE }
            });

            // ── Slide 8: Data Completeness by Field ────────────────────────────
            const slideComplete = pptx.addSlide();
            addBg(slideComplete);
            addTitle(slideComplete, 'Data Completeness by Field', 'Percentage of complete values per field, System A vs System B');
            const completeUrl = Visualizations.getChartDataUrl('chart-completeness');
            if (completeUrl) {
                slideComplete.addImage({ data: completeUrl, x: 0.5, y: 1.3, w: 12.3, h: 5.5 });
            }

            // ── Slide 9: Discrepancy Analysis ──────────────────────────────────
            const slideDisc = pptx.addSlide();
            addBg(slideDisc);
            addTitle(slideDisc, 'Discrepancy Analysis', 'Types of mismatches found in matched records');
            const discUrl = Visualizations.getChartDataUrl('chart-discrepancy');
            if (discUrl) {
                slideDisc.addImage({ data: discUrl, x: 0.7, y: 1.3, w: 5, h: 5 });
            }
            // Discrepancy table
            const discEntries = Object.entries(summary.discrepancyTypes).sort((a, b) => b[1] - a[1]);
            const discTbl = [
                [{ text: 'Discrepancy Type', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
                 { text: 'Count', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
                 { text: '% of Matched', options: { bold: true, color: TEXT, fill: { color: ACCENT } } }],
                ...(discEntries.length > 0 ? discEntries.map(([k, v]) => [
                    { text: k, options: { color: TEXT } },
                    { text: formatNumber(v), options: { color: AMBER, align: 'center' } },
                    { text: pct(v, summary.matched) + '%', options: { color: MUTED, align: 'center' } }
                ]) : [[
                    { text: 'No discrepancies found', options: { color: GREEN } },
                    { text: '0', options: { color: TEXT, align: 'center' } },
                    { text: '0%', options: { color: TEXT, align: 'center' } }
                ]])
            ];
            slideDisc.addTable(discTbl, {
                x: 6.5, y: 1.4, w: 6.5, h: 3.5,
                fontSize: 11, fontFace: 'Calibri',
                rowH: 0.44,
                border: { color: '334155', pt: 0.5 },
                fill: { color: SURFACE }
            });

            // ── Slide 10: Record Volume Comparison ─────────────────────────────
            const slideVol = pptx.addSlide();
            addBg(slideVol);
            addTitle(slideVol, 'Record Volume Comparison', 'Overlap and unique records per system');
            const volUrl = Visualizations.getChartDataUrl('chart-volume');
            if (volUrl) {
                slideVol.addImage({ data: volUrl, x: 2, y: 1.3, w: 9, h: 5.5 });
            }

            // ── Slide 11: Summary / Recommendations ────────────────────────────
            const slideSummary = pptx.addSlide();
            addBg(slideSummary);
            addTitle(slideSummary, 'Summary & Key Findings', 'Generated by Address Summary Organizing Tool');
            const findings = [
                `📊 Analyzed ${formatNumber(summary.totalA)} System A records and ${formatNumber(summary.totalB)} System B records`,
                `✅ ${formatNumber(summary.matched)} records matched (${summary.matchPct}% match rate)`,
                `🎯 ${formatNumber(summary.perfect)} perfect matches — exact address found in both systems`,
                `⚠️  ${formatNumber(summary.unmatchedA)} records in System A have no match in System B`,
                `⚠️  ${formatNumber(summary.unmatchedB)} records in System B have no match in System A`,
                `📋 System A address completeness: ${quality.a.completePct}%`,
                `📋 System B address completeness: ${quality.b.completePct}%`,
            ];
            findings.forEach((text, i) => {
                slideSummary.addText(text, {
                    x: 0.6, y: 1.5 + i * 0.65, w: 12.1, h: 0.5,
                    fontSize: 13, color: TEXT, fontFace: 'Calibri'
                });
            });
            slideSummary.addText(`Report generated: ${now}`, {
                x: 0.6, y: 6.9, w: 12.1, h: 0.3,
                fontSize: 10, color: MUTED, fontFace: 'Calibri'
            });

            // ── Slide 12: AI Metrics Overview ──────────────────────────────────
            const { aiMetrics, matchDetails } = state.analysis;
            if (aiMetrics) {
                const slideAI = pptx.addSlide();
                addBg(slideAI);
                addTitle(slideAI, '🤖 AI / ML Metrics Overview', 'Statistical model evaluation metrics derived from matching analysis');
                const aiBoxes = [
                    { label: 'Precision',           value: aiMetrics.precision + '%',         color: GREEN  },
                    { label: 'Recall',              value: aiMetrics.recall + '%',             color: GREEN  },
                    { label: 'F1 Score',            value: aiMetrics.f1Score + '%',            color: ACCENT },
                    { label: 'Accuracy',            value: aiMetrics.accuracy + '%',           color: ACCENT },
                    { label: 'Jaccard Index',       value: aiMetrics.jaccardIndex + '%',       color: PURPLE },
                    { label: 'Confidence Index',    value: aiMetrics.overallConfidence + '%',  color: GREEN  }
                ];
                const aiBoxW = 1.9, aiBoxH = 1.1, aiGap = 0.15, aiStartX = 0.5, aiRow1Y = 1.4;
                aiBoxes.forEach((b, i) => {
                    statBox(slideAI, aiStartX + i * (aiBoxW + aiGap), aiRow1Y, aiBoxW, aiBoxH, b.label, b.value, b.color);
                });
                const aiRow2 = [
                    { label: 'False Pos. Risk',     value: aiMetrics.falsePositiveRisk + '%',  color: AMBER },
                    { label: 'Anomaly Rate',        value: aiMetrics.anomalyRate + '%',         color: AMBER },
                    { label: 'Shannon Entropy',     value: aiMetrics.entropy.toFixed(2),        color: MUTED },
                    { label: 'Gini Coeff.',         value: aiMetrics.giniCoefficient.toFixed(3),color: MUTED },
                    { label: 'Geo Similarity',      value: aiMetrics.cosineSimilarity + '%',    color: ACCENT }
                ];
                const aiRow2Y = aiRow1Y + aiBoxH + 0.3;
                aiRow2.forEach((b, i) => {
                    statBox(slideAI, aiStartX + i * (aiBoxW + aiGap), aiRow2Y, aiBoxW, aiBoxH, b.label, b.value, b.color);
                });
                if (matchDetails) {
                    const bandY = aiRow2Y + aiBoxH + 0.4;
                    slideAI.addText(`Model Confidence Band — P10: ${matchDetails.scorePercentiles.p10}%  |  P50: ${matchDetails.scorePercentiles.p50}%  |  P90: ${matchDetails.scorePercentiles.p90}%`, {
                        x: 0.5, y: bandY, w: 12, h: 0.4,
                        fontSize: 12, color: TEXT, fontFace: 'Calibri', align: 'center'
                    });
                    const bandTrackW = 11;
                    slideAI.addShape(pptx.ShapeType.rect, { x: 1.0, y: bandY + 0.5, w: bandTrackW, h: 0.2, fill: { color: '334155' }, rounding: 0.05 });
                    const p10x = 1.0 + (matchDetails.scorePercentiles.p10 / 100) * bandTrackW;
                    const p90x = 1.0 + (matchDetails.scorePercentiles.p90 / 100) * bandTrackW;
                    const p50x = 1.0 + (matchDetails.scorePercentiles.p50 / 100) * bandTrackW;
                    slideAI.addShape(pptx.ShapeType.rect, { x: p10x, y: bandY + 0.5, w: p90x - p10x, h: 0.2, fill: { color: ACCENT + '66' }, rounding: 0.05 });
                    slideAI.addShape(pptx.ShapeType.rect, { x: p50x - 0.03, y: bandY + 0.45, w: 0.06, h: 0.3, fill: { color: GREEN } });
                }
                const aiChartUrl = Visualizations.getChartDataUrl('chart-ai-match-type');
                if (aiChartUrl) {
                    slideAI.addImage({ data: aiChartUrl, x: 9.5, y: 1.4, w: 3.3, h: 3.0 });
                }
            }

            // ── Slide 13: Data Quality Scores ──────────────────────────────────
            if (aiMetrics) {
                const slideDQ = pptx.addSlide();
                addBg(slideDQ);
                addTitle(slideDQ, 'Data Quality Scores', 'Composite quality index per system — completeness, validity & deduplication');
                statBox(slideDQ, 1.5,  1.4, 4, 1.5, 'System A — DQ Score', aiMetrics.dqScoreA.toFixed(1) + '%',
                    aiMetrics.dqScoreA >= 90 ? GREEN : aiMetrics.dqScoreA >= 70 ? '84CC16' : aiMetrics.dqScoreA >= 55 ? AMBER : RED);
                statBox(slideDQ, 7.83, 1.4, 4, 1.5, 'System B — DQ Score', aiMetrics.dqScoreB.toFixed(1) + '%',
                    aiMetrics.dqScoreB >= 90 ? GREEN : aiMetrics.dqScoreB >= 70 ? '84CC16' : aiMetrics.dqScoreB >= 55 ? AMBER : RED);
                const dqQRows = [
                    ['Metric', 'System A', 'System B'],
                    ['Complete %', quality.a.completePct + '%', quality.b.completePct + '%'],
                    ['Invalid ZIP %', quality.a.invalidZipPct + '%', quality.b.invalidZipPct + '%'],
                    ['Invalid State %', quality.a.invalidStatePct + '%', quality.b.invalidStatePct + '%'],
                    ['Duplicate %', quality.a.duplicatePct + '%', quality.b.duplicatePct + '%'],
                    ['Avg Fields', quality.a.avgFieldsPopulated.toFixed(2), quality.b.avgFieldsPopulated.toFixed(2)],
                    ['Secondary Units', formatNumber(quality.a.recordsWithSecondaryUnit), formatNumber(quality.b.recordsWithSecondaryUnit)],
                    ['ZIP+4 Count', formatNumber(quality.a.hasZipPlus4Count), formatNumber(quality.b.hasZipPlus4Count)],
                    ['Standardized St%', quality.a.standardizedStreetPct + '%', quality.b.standardizedStreetPct + '%'],
                ];
                const dqTbl = [
                    dqQRows[0].map((t, i) => ({ text: t, options: { bold: true, color: TEXT, fill: { color: i === 0 ? SURFACE : ACCENT } } })),
                    ...dqQRows.slice(1).map(r => r.map((c, i) => ({ text: c, options: { color: i === 0 ? MUTED : TEXT } })))
                ];
                slideDQ.addTable(dqTbl, {
                    x: 1.5, y: 3.2, w: 10.3, h: 3.8,
                    fontSize: 11, fontFace: 'Calibri',
                    rowH: 0.38,
                    border: { color: '334155', pt: 0.5 },
                    fill: { color: SURFACE }
                });
                const dqUrl = Visualizations.getChartDataUrl('chart-ai-dq-comparison');
                if (dqUrl) {
                    slideDQ.addImage({ data: dqUrl, x: 1.5, y: 7.0, w: 4.0, h: 0.5 });
                }
            }

            // ── Save ─────────────────────────────────────────────────────────
            hideLoading();
            await pptx.writeFile({ fileName: 'Address_Analysis_Report.pptx' });
            showAlert('export-alert', 'success', 'PowerPoint presentation downloaded: Address_Analysis_Report.pptx');
        } catch (err) {
            hideLoading();
            showAlert('export-alert', 'danger', 'PowerPoint export failed: ' + err.message);
            console.error(err);
        }
    }

    // ===== INIT =====
    function init() {
        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                showTab(tab.dataset.tab);
            });
        });

        // Start over button
        document.getElementById('btn-start-over')?.addEventListener('click', () => {
            state.dataA = null;
            state.dataB = null;
            state.matchResults = null;
            state.analysis = null;
            // Reset upload zones
            ['a', 'b'].forEach(sys => {
                const infoEl = document.getElementById(`file-info-${sys}`);
                const zoneEl = document.getElementById(`upload-zone-${sys}`);
                const input  = document.getElementById(`file-input-${sys}`);
                if (infoEl) { infoEl.textContent = ''; infoEl.classList.remove('visible'); }
                if (zoneEl) zoneEl.classList.remove('loaded');
                if (input)  input.value = '';
                clearAlert(`upload-alert-${sys}`);
            });
            clearAlert('analyze-alert');
            updateAnalyzeButton();
            showLandingPage();
        });

        // File upload
        document.getElementById('file-input-a').addEventListener('change', (e) => handleFileUpload(e.target, 'a'));
        document.getElementById('file-input-b').addEventListener('change', (e) => handleFileUpload(e.target, 'b'));

        // Drag and drop
        ['upload-zone-a', 'upload-zone-b'].forEach((zoneId, i) => {
            const zone = document.getElementById(zoneId);
            const inputId = i === 0 ? 'file-input-a' : 'file-input-b';
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) {
                    const input = document.getElementById(inputId);
                    // Create a DataTransfer to set files on the input
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    handleFileUpload(input, i === 0 ? 'a' : 'b');
                }
            });
        });

        // Analyze button
        document.getElementById('btn-analyze').addEventListener('click', runAnalysis);

        // Threshold slider
        const threshSlider = document.getElementById('threshold-slider');
        const threshVal = document.getElementById('threshold-value');
        if (threshSlider) {
            threshSlider.addEventListener('input', () => {
                state.threshold = parseInt(threshSlider.value);
                if (threshVal) threshVal.textContent = state.threshold + '%';
            });
        }

        // Weight sliders
        ['zip', 'state', 'city', 'street'].forEach(field => {
            const slider = document.getElementById(`weight-${field}`);
            const val = document.getElementById(`weight-${field}-val`);
            if (slider) {
                slider.addEventListener('input', () => {
                    state.weights[field] = parseInt(slider.value);
                    if (val) val.textContent = slider.value;
                });
            }
        });

        // Matched table filters
        const searchInput = document.getElementById('matched-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                state.matchedFilter.search = searchInput.value;
                state.matchedPage = 1;
                renderMatchedTable();
            });
        }
        const confidenceFilter = document.getElementById('matched-confidence-filter');
        if (confidenceFilter) {
            confidenceFilter.addEventListener('change', () => {
                state.matchedFilter.confidence = confidenceFilter.value;
                state.matchedPage = 1;
                renderMatchedTable();
            });
        }
        const stateFilter = document.getElementById('matched-state-filter');
        if (stateFilter) {
            stateFilter.addEventListener('input', () => {
                state.matchedFilter.state = stateFilter.value;
                state.matchedPage = 1;
                renderMatchedTable();
            });
        }

        // Chart download buttons
        document.querySelectorAll('[data-export-chart]').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.dataset.exportChart;
                const label = btn.dataset.exportLabel || chartId;
                Visualizations.exportChartPng(chartId, label + '.png');
            });
        });

        // CSV exports
        document.getElementById('export-matched-csv')?.addEventListener('click', exportMatchedCsv);
        document.getElementById('export-unmatched-a-csv')?.addEventListener('click', exportUnmatchedACsv);
        document.getElementById('export-unmatched-b-csv')?.addEventListener('click', exportUnmatchedBCsv);
        document.getElementById('export-summary-csv')?.addEventListener('click', exportSummaryCsv);

        // PowerPoint export
        document.getElementById('export-pptx-btn')?.addEventListener('click', exportPowerPoint);

        // Also wire nav export-pptx link
        document.getElementById('nav-export-pptx')?.addEventListener('click', exportPowerPoint);
    }

    // Kick off on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { state, runAnalysis, exportPowerPoint };
})();
