/**
 * savings-report.js — USPS Postal Savings Report
 * Handles calculation, display updates, and PNG export for the
 * AME + AI carrier route savings dashboard.
 */

const SavingsReport = (() => {

    function fmt(n)  { return Number(n).toLocaleString('en-US'); }
    function pct(n)  { return n.toFixed(2) + '%'; }
    function pct1(n) { return n.toFixed(1) + '%'; }
    function money(n){ return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function el(id)  { return document.getElementById(id); }

    function recalculate() {
        const total    = parseFloat(el('sr-total').value)   || 0;
        const dateRange = el('sr-daterange').value.trim()   || '';
        const cost     = parseFloat(el('sr-cost').value)    || 0.44;
        const ameFixed = parseFloat(el('sr-ame-fixed').value) || 0;
        const ameRoute = parseFloat(el('sr-ame-route').value) || 0;
        const aiFixed  = parseFloat(el('sr-ai-fixed').value)  || 0;
        const aiRoute  = parseFloat(el('sr-ai-route').value)  || 0;

        // Derived values
        const ameFixedPct   = total   ? (ameFixed / total)   * 100 : 0;
        const ameOverallPct = total   ? (ameRoute / total)   * 100 : 0;
        const ameRatePct    = ameFixed ? (ameRoute / ameFixed) * 100 : 0;
        const ameSavings    = ameRoute * cost;

        const aiFixedPct    = total   ? (aiFixed  / total)   * 100 : 0;
        const aiOverallPct  = total   ? (aiRoute  / total)   * 100 : 0;
        const aiRatePct     = aiFixed  ? (aiRoute  / aiFixed)  * 100 : 0;
        const aiSavings     = aiRoute  * cost;

        const totalRouted   = ameRoute + aiRoute;
        const combinedPct   = total   ? (totalRouted / total) * 100 : 0;
        const totalSavings  = totalRouted * cost;

        // Header
        el('sr-disp-total').textContent        = fmt(total);
        el('sr-disp-daterange').innerHTML      =
            dateRange + ' &nbsp;·&nbsp; ' + money(cost) + ' / manually handled address';
        el('sr-disp-combined-rate').textContent = pct(combinedPct);
        el('sr-disp-combined-breakdown').textContent =
            'AME ' + pct(ameOverallPct) + ' + AI ' + pct(aiOverallPct);
        el('sr-disp-total-savings').textContent = money(totalSavings);
        el('sr-disp-total-savings-sub').textContent =
            fmt(totalRouted) + ' routed × ' + money(cost);

        // AME panel
        el('sr-disp-ame-overall').textContent     = pct(ameOverallPct);
        el('sr-disp-ame-overall-sub').textContent = 'of ' + fmt(total) + ' total';
        el('sr-disp-ame-fixed').textContent       = fmt(ameFixed);
        el('sr-disp-ame-fixed-pct').textContent   = pct(ameFixedPct) + ' of input';
        el('sr-disp-ame-route').textContent       = fmt(ameRoute);
        el('sr-disp-ame-route-sub').textContent   = 'of ' + fmt(ameFixed) + ' fixed';
        el('sr-disp-ame-rate').textContent        = pct1(ameRatePct);
        el('sr-disp-ame-savings').textContent     = money(ameSavings);
        el('sr-disp-ame-savings-sub').textContent =
            fmt(ameRoute) + ' × ' + money(cost);
        el('sr-disp-ame-bar-pct').textContent     = pct1(ameRatePct);
        el('sr-ame-bar').style.width              = Math.min(ameRatePct, 100) + '%';

        // AI panel
        el('sr-disp-ai-overall').textContent      = pct(aiOverallPct);
        el('sr-disp-ai-overall-sub').textContent  = 'of ' + fmt(total) + ' total';
        el('sr-disp-ai-fixed').textContent        = fmt(aiFixed);
        el('sr-disp-ai-fixed-pct').textContent    = pct(aiFixedPct) + ' of input';
        el('sr-disp-ai-route').textContent        = fmt(aiRoute);
        el('sr-disp-ai-route-sub').textContent    = 'of ' + fmt(aiFixed) + ' fixed';
        el('sr-disp-ai-rate').textContent         = pct1(aiRatePct);
        el('sr-disp-ai-savings').textContent      = money(aiSavings);
        el('sr-disp-ai-savings-sub').textContent  =
            fmt(aiRoute) + ' × ' + money(cost);
        el('sr-disp-ai-bar-pct').textContent      = pct1(aiRatePct);
        el('sr-ai-bar').style.width               = Math.min(aiRatePct, 100) + '%';
    }

    function exportPng() {
        const dashboard = el('sr-dashboard');
        if (!dashboard) return;
        if (typeof html2canvas === 'undefined') {
            alert('Export requires html2canvas. Please ensure the page is fully loaded.');
            return;
        }
        html2canvas(dashboard, { scale: 2, useCORS: true, backgroundColor: '#0d1b3e' })
            .then(canvas => {
                const link = document.createElement('a');
                link.download = 'usps_savings_report.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
    }

    function init() {
        // Recalculate button
        const recalcBtn = el('sr-recalc');
        if (recalcBtn) recalcBtn.addEventListener('click', recalculate);

        // Live update on input change
        ['sr-total','sr-daterange','sr-cost','sr-ame-fixed','sr-ame-route','sr-ai-fixed','sr-ai-route']
            .forEach(id => {
                const inp = el(id);
                if (inp) inp.addEventListener('input', recalculate);
            });

        // Export PNG
        const exportBtn = el('sr-export-png');
        if (exportBtn) exportBtn.addEventListener('click', exportPng);

        // Landing page header button → switch to savings report tab
        const landingBtn = el('btn-savings-report-landing');
        if (landingBtn) {
            landingBtn.addEventListener('click', () => {
                const analysisView = el('analysis-view');
                const landingPage  = el('landing-page');
                if (analysisView && landingPage) {
                    landingPage.style.display  = 'none';
                    analysisView.style.display = '';
                    el('header-landing-actions').style.display = 'none';
                    el('header-analysis-actions').style.display = '';
                }
                // Activate the savings-report tab
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                const srTab = document.querySelector('.nav-tab[data-tab="savings-report"]');
                const srSection = el('tab-savings-report');
                if (srTab) srTab.classList.add('active');
                if (srSection) srSection.classList.add('active');
            });
        }

        // Run initial render with pre-filled values
        recalculate();
    }

    document.addEventListener('DOMContentLoaded', init);

    return { recalculate, exportPng };
})();
