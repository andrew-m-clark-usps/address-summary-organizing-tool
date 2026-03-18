/**
 * visualizations.js — Chart Rendering using Chart.js 4.x
 * Creates and manages all 9 dashboard charts
 */

const Visualizations = (() => {

    // Color palette (matches CSS variables)
    const COLORS = {
        perfect:  '#4A8C6F',
        high:     '#6BA86A',
        partial:  '#C4873B',
        low:      '#B8703A',
        none:     '#C0564B',
        systemA:  '#4A7C9B',
        systemB:  '#8B6B8A',
        complete: '#4A8C6F',
        incomplete: '#C4873B',
        matched:  '#4A8C6F',
        unmatchedA: '#4A7C9B',
        unmatchedB: '#8B6B8A'
    };

    const ALPHA = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

    // Registry of created chart instances (for destroy/update)
    const chartInstances = {};

    const defaultFont = {
        family: "'Inter', system-ui, sans-serif",
        size: 12
    };

    const defaultGridColor = 'rgba(232,229,224,0.8)';
    const defaultTickColor = '#6B6B6B';
    const defaultTextColor = '#2D2D2D';

    Chart.defaults.color = defaultTickColor;
    Chart.defaults.font = defaultFont;

    function destroyChart(id) {
        if (chartInstances[id]) {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }
    }

    function getCtx(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        destroyChart(canvasId);
        return canvas.getContext('2d');
    }

    /**
     * Chart 1: Match Distribution Pie Chart
     */
    function renderMatchDistributionPie(stats) {
        const ctx = getCtx('chart-match-dist');
        if (!ctx) return;
        const data = [
            stats.perfect,
            stats.high,
            stats.partial,
            stats.low,
            stats.veryLow
        ];
        chartInstances['chart-match-dist'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Perfect (100%)', 'High (90-99%)', 'Partial (70-89%)', 'Low (50-69%)', 'No Match (<50%)'],
                datasets: [{
                    data,
                    backgroundColor: [COLORS.perfect, COLORS.high, COLORS.partial, COLORS.low, COLORS.none],
                    borderColor: '#FFFFFF',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, padding: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '55%'
            }
        });
    }

    /**
     * Chart 2: Match Summary Bar Chart
     */
    function renderMatchSummaryBar(stats) {
        const ctx = getCtx('chart-match-summary');
        if (!ctx) return;
        chartInstances['chart-match-summary'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['System A Total', 'System B Total', 'Matched', 'Unmatched A', 'Unmatched B'],
                datasets: [{
                    label: 'Records',
                    data: [stats.totalA, stats.totalB, stats.matched, stats.unmatchedA, stats.unmatchedB],
                    backgroundColor: [COLORS.systemA, COLORS.systemB, COLORS.perfect, ALPHA(COLORS.systemA, 0.6), ALPHA(COLORS.systemB, 0.6)],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${ctx.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: defaultGridColor }, ticks: { color: defaultTickColor } },
                    y: {
                        grid: { color: defaultGridColor },
                        ticks: {
                            color: defaultTickColor,
                            callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Chart 3: Top States Horizontal Bar Chart
     */
    function renderTopStatesChart(geoMatch) {
        const ctx = getCtx('chart-states');
        if (!ctx) return;
        const top = geoMatch.slice(0, 15);
        chartInstances['chart-states'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map(s => s.state),
                datasets: [
                    {
                        label: 'Matched',
                        data: top.map(s => s.matched),
                        backgroundColor: COLORS.perfect,
                        borderRadius: 3,
                        stack: 'stack'
                    },
                    {
                        label: 'Unmatched A',
                        data: top.map(s => s.unmatchedA),
                        backgroundColor: ALPHA(COLORS.systemA, 0.7),
                        borderRadius: 3,
                        stack: 'stack'
                    },
                    {
                        label: 'Unmatched B',
                        data: top.map(s => s.unmatchedB),
                        backgroundColor: ALPHA(COLORS.systemB, 0.7),
                        borderRadius: 3,
                        stack: 'stack'
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: defaultGridColor },
                        ticks: {
                            color: defaultTickColor,
                            callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
                        }
                    },
                    y: { stacked: true, grid: { display: false }, ticks: { color: defaultTickColor } }
                }
            }
        });
    }

    /**
     * Chart 4: Match Confidence Distribution Histogram
     */
    function renderConfidenceHistogram(histogram) {
        const ctx = getCtx('chart-confidence-hist');
        if (!ctx) return;
        const labels = ['0-9%', '10-19%', '20-29%', '30-39%', '40-49%', '50-59%', '60-69%', '70-79%', '80-89%', '90-100%'];
        const bgColors = [
            COLORS.none, COLORS.none, COLORS.none, COLORS.none, COLORS.none,
            ALPHA(COLORS.low, 0.8), ALPHA(COLORS.low, 0.9), COLORS.partial, COLORS.high, COLORS.perfect
        ];
        chartInstances['chart-confidence-hist'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Records',
                    data: histogram,
                    backgroundColor: bgColors,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Records: ${ctx.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor, font: { size: 10 } } },
                    y: {
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Chart 5: Data Completeness by Field
     */
    function renderFieldCompletenessChart(qualityA, qualityB) {
        const ctx = getCtx('chart-completeness');
        if (!ctx) return;
        const fields = ['Street', 'City', 'State', 'ZIP'];
        const dataA = [qualityA.fieldCompleteness.street, qualityA.fieldCompleteness.city, qualityA.fieldCompleteness.state, qualityA.fieldCompleteness.zip];
        const dataB = [qualityB.fieldCompleteness.street, qualityB.fieldCompleteness.city, qualityB.fieldCompleteness.state, qualityB.fieldCompleteness.zip];
        chartInstances['chart-completeness'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: fields,
                datasets: [
                    {
                        label: 'System A',
                        data: dataA,
                        backgroundColor: ALPHA(COLORS.systemA, 0.85),
                        borderRadius: 4
                    },
                    {
                        label: 'System B',
                        data: dataB,
                        backgroundColor: ALPHA(COLORS.systemB, 0.85),
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor } },
                    y: {
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' },
                        min: 0, max: 100
                    }
                }
            }
        });
    }

    /**
     * Chart 6: Address Quality Pie Chart
     */
    function renderAddressQualityPie(qualityA) {
        const ctx = getCtx('chart-quality');
        if (!ctx) return;
        const data = [
            qualityA.complete,
            qualityA.missingZip,
            qualityA.missingCity,
            qualityA.missingState,
            qualityA.multiMissing
        ];
        chartInstances['chart-quality'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Complete', 'Missing ZIP', 'Missing City', 'Missing State', 'Multiple Missing'],
                datasets: [{
                    data,
                    backgroundColor: [COLORS.complete, ALPHA(COLORS.low, 0.9), ALPHA(COLORS.partial, 0.9), ALPHA(COLORS.none, 0.7), COLORS.none],
                    borderColor: '#FFFFFF',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, padding: 10, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '55%'
            }
        });
    }

    /**
     * Chart 7: Top Cities Comparison Chart
     */
    function renderTopCitiesChart(cities) {
        const ctx = getCtx('chart-cities');
        if (!ctx) return;
        const top = cities.slice(0, 10);
        chartInstances['chart-cities'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map(c => {
                    const label = c.city.length > 14 ? c.city.substring(0, 14) + '…' : c.city;
                    return label;
                }),
                datasets: [
                    {
                        label: 'System A',
                        data: top.map(c => c.countA),
                        backgroundColor: ALPHA(COLORS.systemA, 0.85),
                        borderRadius: 4
                    },
                    {
                        label: 'System B',
                        data: top.map(c => c.countB),
                        backgroundColor: ALPHA(COLORS.systemB, 0.85),
                        borderRadius: 4
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v },
                        beginAtZero: true
                    },
                    y: { grid: { display: false }, ticks: { color: defaultTickColor, font: { size: 10 } } }
                }
            }
        });
    }

    /**
     * Chart 8: Discrepancy Types Pie/Donut
     */
    function renderDiscrepancyChart(discrepancyTypes) {
        const ctx = getCtx('chart-discrepancy');
        if (!ctx) return;
        const entries = Object.entries(discrepancyTypes).sort((a, b) => b[1] - a[1]);
        const labels = entries.map(([k]) => k);
        const data   = entries.map(([, v]) => v);
        const bgColors = [COLORS.none, ALPHA(COLORS.low, 0.9), COLORS.partial, COLORS.high, ALPHA(COLORS.systemB, 0.8)];
        chartInstances['chart-discrepancy'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['No Discrepancies'],
                datasets: [{
                    data: data.length ? data : [1],
                    backgroundColor: data.length ? bgColors.slice(0, labels.length) : [COLORS.perfect],
                    borderColor: '#FFFFFF',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, padding: 10, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '55%'
            }
        });
    }

    /**
     * Chart 9: Record Volume Comparison (simple grouped bar)
     */
    function renderVolumeComparisonChart(stats) {
        const ctx = getCtx('chart-volume');
        if (!ctx) return;
        chartInstances['chart-volume'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['System A', 'System B'],
                datasets: [
                    {
                        label: 'Matched',
                        data: [stats.matched, stats.matched],
                        backgroundColor: COLORS.perfect,
                        borderRadius: 4,
                        stack: 'stack'
                    },
                    {
                        label: 'Unique to System',
                        data: [stats.unmatchedA, stats.unmatchedB],
                        backgroundColor: [ALPHA(COLORS.systemA, 0.7), ALPHA(COLORS.systemB, 0.7)],
                        borderRadius: 4,
                        stack: 'stack'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: defaultTickColor, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { color: defaultTickColor } },
                    y: {
                        stacked: true,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Render all charts from a full analysis result
     */
    function renderAll(analysis) {
        const { summary, quality, geo, cities } = analysis;
        renderMatchDistributionPie(summary);
        renderMatchSummaryBar(summary);
        renderTopStatesChart(geo.geoMatch);
        renderConfidenceHistogram(summary.histogram);
        renderFieldCompletenessChart(quality.a, quality.b);
        renderAddressQualityPie(quality.a);
        renderTopCitiesChart(cities);
        renderDiscrepancyChart(summary.discrepancyTypes);
        renderVolumeComparisonChart(summary);
    }

    /**
     * Export a chart canvas as PNG
     */
    function exportChartPng(canvasId, filename) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = filename || (canvasId + '.png');
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    /**
     * Get chart image data URL (used for PowerPoint export)
     */
    function getChartDataUrl(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        return canvas.toDataURL('image/png');
    }

    return {
        renderAll,
        renderMatchDistributionPie,
        renderMatchSummaryBar,
        renderTopStatesChart,
        renderConfidenceHistogram,
        renderFieldCompletenessChart,
        renderAddressQualityPie,
        renderTopCitiesChart,
        renderDiscrepancyChart,
        renderVolumeComparisonChart,
        exportChartPng,
        getChartDataUrl,
        chartInstances,
        COLORS
    };
})();
