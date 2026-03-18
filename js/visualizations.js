/**
 * visualizations.js — Chart Rendering using Chart.js 4.x
 * Creates and manages all 9 dashboard charts
 */

const Visualizations = (() => {

    // Color palette (matches CSS variables)
    const COLORS = {
        perfect:  '#059669',
        high:     '#65A30D',
        partial:  '#D97706',
        low:      '#EA580C',
        none:     '#DC2626',
        systemA:  '#2563EB',
        systemB:  '#D97706',
        complete: '#059669',
        incomplete: '#D97706',
        matched:  '#059669',
        unmatchedA: '#2563EB',
        unmatchedB: '#D97706'
    };

    const ALPHA = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

    // Registry of created chart instances (for destroy/update)
    const chartInstances = {};

    const defaultFont = {
        family: "'Inter', system-ui, sans-serif",
        size: 12
    };

    const defaultGridColor = 'rgba(229,231,235,0.8)';
    const defaultTickColor = '#6B7280';
    const defaultTextColor = '#1F2937';

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
        const { summary, quality, geo, cities, extendedAIMetrics, geoMetrics, addressTypes, fieldContribution, discrepancyPatterns } = analysis;
        renderMatchDistributionPie(summary);
        renderMatchSummaryBar(summary);
        renderTopStatesChart(geo.geoMatch);
        renderConfidenceHistogram(summary.histogram);
        renderFieldCompletenessChart(quality.a, quality.b);
        renderAddressQualityPie(quality.a);
        renderTopCitiesChart(cities);
        renderDiscrepancyChart(summary.discrepancyTypes);
        renderVolumeComparisonChart(summary);
        // AI charts rendered separately via renderAIMetrics() in app.js

        // Extended charts
        if (extendedAIMetrics) {
            renderAIScoreDistribution(extendedAIMetrics);
            renderAIMetricsRadar(extendedAIMetrics);
            renderAIScoreHistogram(extendedAIMetrics);
        }
        if (geoMetrics) renderGeoDistanceChart(geoMetrics);
        if (addressTypes) renderAddressTypeChart(addressTypes);
        if (fieldContribution) renderFieldImportanceChart(fieldContribution);
        renderExpandedCompletenessChart(quality.a, quality.b);
        if (discrepancyPatterns) renderDiscrepancyCombosChart(discrepancyPatterns);
        renderDataQualityGauge(quality.a, quality.b);
    }

    /**
     * AI Chart: Match Type Donut (exact vs fuzzy)
     */
    function renderMatchTypeDonut(matchDetails) {
        const ctx = getCtx('chart-ai-match-type');
        if (!ctx) return;
        chartInstances['chart-ai-match-type'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Exact Matches', 'Fuzzy Matches'],
                datasets: [{
                    data: [matchDetails.exactMatchCount, matchDetails.fuzzyMatchCount],
                    backgroundColor: [COLORS.perfect, COLORS.partial],
                    borderColor: '#FFFFFF',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: defaultTickColor, padding: 12, font: { size: 11 } } },
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
     * AI Chart: Component Scores Horizontal Bar
     */
    function renderComponentScoresBar(matchDetails) {
        const ctx = getCtx('chart-ai-component-scores');
        if (!ctx) return;
        chartInstances['chart-ai-component-scores'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Street', 'City', 'State', 'ZIP'],
                datasets: [{
                    label: 'Avg Component Score',
                    data: [
                        matchDetails.avgStreetScore,
                        matchDetails.avgCityScore,
                        matchDetails.avgStateScore,
                        matchDetails.avgZipScore
                    ],
                    backgroundColor: [
                        ALPHA(COLORS.systemA, 0.7),
                        ALPHA(COLORS.perfect,  0.7),
                        ALPHA(COLORS.high,     0.7),
                        ALPHA(COLORS.partial,  0.7)
                    ],
                    borderColor: [COLORS.systemA, COLORS.perfect, COLORS.high, COLORS.partial],
                    borderWidth: 1.5,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` Score: ${ctx.parsed.x}%` } }
                },
                scales: {
                    x: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' }
                    },
                    y: { grid: { display: false }, ticks: { color: defaultTickColor } }
                }
            }
        });
    }

    /**
     * AI Chart: Confidence Band (percentile range)
     */
    function renderConfidenceBandChart(matchDetails) {
        const ctx = getCtx('chart-ai-confidence-band');
        if (!ctx) return;
        const p = matchDetails.scorePercentiles;
        chartInstances['chart-ai-confidence-band'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['P10', 'P25', 'P50 (Median)', 'P75', 'P90'],
                datasets: [{
                    label: 'Percentile Score',
                    data: [p.p10, p.p25, p.p50, p.p75, p.p90],
                    backgroundColor: [
                        ALPHA(COLORS.none,    0.6),
                        ALPHA(COLORS.partial, 0.6),
                        ALPHA(COLORS.perfect, 0.8),
                        ALPHA(COLORS.partial, 0.6),
                        ALPHA(COLORS.none,    0.6)
                    ],
                    borderColor: [COLORS.none, COLORS.partial, COLORS.perfect, COLORS.partial, COLORS.none],
                    borderWidth: 1.5,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.y}%` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor } },
                    y: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' }
                    }
                }
            }
        });
    }

    /**
     * AI Chart: DQ Score Comparison Bar
     */
    function renderDQComparisonBar(aiMetrics) {
        const ctx = getCtx('chart-ai-dq-comparison');
        if (!ctx) return;
        chartInstances['chart-ai-dq-comparison'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['System A', 'System B'],
                datasets: [{
                    label: 'Data Quality Score',
                    data: [aiMetrics.dqScoreA, aiMetrics.dqScoreB],
                    backgroundColor: [ALPHA(COLORS.systemA, 0.7), ALPHA(COLORS.systemB, 0.7)],
                    borderColor: [COLORS.systemA, COLORS.systemB],
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` DQ Score: ${ctx.parsed.y}%` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor } },
                    y: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' }
                    }
                }
            }
        });
    }

    /**
     * Extended Chart 1: AI Score Distribution Doughnut
     */
    function renderAIScoreDistribution(extendedAIMetrics) {
        const ctx = getCtx('chart-ai-score-dist');
        if (!ctx) return;
        const dist = extendedAIMetrics && extendedAIMetrics.aiConfidenceDistribution;
        if (!dist) return;
        const high   = dist.high   || 0;
        const medium = dist.medium || 0;
        const low    = dist.low    || 0;
        chartInstances['chart-ai-score-dist'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['High (≥80)', 'Medium (50-79)', 'Low (<50)'],
                datasets: [{
                    data: [high, medium, low],
                    backgroundColor: [COLORS.perfect, COLORS.partial, COLORS.none],
                    borderColor: '#FFFFFF',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: defaultTickColor, padding: 12, font: { size: 11 } } },
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
     * Extended Chart 2: AI Score vs Traditional Score Scatter
     */
    function renderAIVsTraditionalScatter(matchResults) {
        const ctx = getCtx('chart-ai-vs-traditional');
        if (!ctx) return;
        if (!matchResults || !matchResults.matched) return;
        const points = matchResults.matched.slice(0, 500).map(m => ({ x: m.aiScore, y: m.score }));
        const bgColors = points.map(p => {
            if (p.y >= 90) return ALPHA(COLORS.perfect, 0.7);
            if (p.y >= 70) return ALPHA(COLORS.partial, 0.7);
            return ALPHA(COLORS.none, 0.7);
        });
        chartInstances['chart-ai-vs-traditional'] = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Matches',
                    data: points,
                    backgroundColor: bgColors,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` AI: ${ctx.parsed.x}  Traditional: ${ctx.parsed.y}`
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' },
                        title: { display: true, text: 'AI Score', color: defaultTickColor }
                    },
                    y: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' },
                        title: { display: true, text: 'Traditional Score', color: defaultTickColor }
                    }
                }
            }
        });
    }

    /**
     * Extended Chart 3: AI Metrics Radar
     */
    function renderAIMetricsRadar(extendedAIMetrics) {
        const ctx = getCtx('chart-ai-metrics-radar');
        if (!ctx) return;
        if (!extendedAIMetrics) return;
        const avg = extendedAIMetrics.avgAlgorithmScores || {};
        const data = [
            (avg.jaccard         || 0) * 100,
            (avg.jaroWinkler     || 0) * 100,
            (avg.nGram           || 0) * 100,
            (avg.tokenOverlap    || 0) * 100,
            (avg.soundex         || 0) * 100,
            (avg.levenshteinSim  || 0) * 100
        ];
        chartInstances['chart-ai-metrics-radar'] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Jaccard', 'Jaro-Winkler', 'N-Gram', 'Token Overlap', 'Soundex', 'Levenshtein Sim'],
                datasets: [{
                    label: 'Avg Score',
                    data,
                    backgroundColor: ALPHA(COLORS.systemA, 0.2),
                    borderColor: COLORS.systemA,
                    borderWidth: 2,
                    pointBackgroundColor: COLORS.systemA,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.r.toFixed(1)}` } }
                },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { color: defaultTickColor, stepSize: 20, backdropColor: 'transparent' },
                        grid: { color: defaultGridColor },
                        pointLabels: { color: defaultTextColor, font: { size: 11 } }
                    }
                }
            }
        });
    }

    /**
     * Extended Chart 4: Geo Distance Distribution Bar
     */
    function renderGeoDistanceChart(geoMetrics) {
        const ctx = getCtx('chart-geo-distance');
        if (!ctx) return;
        if (!geoMetrics) return;
        const w01  = geoMetrics.matchesWithin_01mi  || 0;
        const w1   = geoMetrics.matchesWithin_1mi   || 0;
        const w5   = geoMetrics.matchesWithin_5mi   || 0;
        const bnd  = geoMetrics.matchesBeyond_10mi  || 0;
        const buckets = [w01, w1 - w01, w5 - w1, bnd];
        chartInstances['chart-geo-distance'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['< 0.1 mi', '0.1-1 mi', '1-5 mi', '5-10+ mi'],
                datasets: [{
                    label: 'Matches',
                    data: buckets,
                    backgroundColor: [COLORS.perfect, COLORS.partial, ALPHA(COLORS.low, 0.9), COLORS.none],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` Matches: ${ctx.parsed.y.toLocaleString()}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor } },
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
     * Extended Chart 5: Address Type Match Rate Horizontal Bar
     */
    function renderAddressTypeChart(addressTypes) {
        const ctx = getCtx('chart-address-type');
        if (!ctx) return;
        if (!addressTypes || !addressTypes.matchRateByType) return;
        const typeMap = addressTypes.matchRateByType;
        const labels = ['residential', 'commercial', 'PO Box', 'military', 'unknown'];
        const data   = labels.map(l => typeMap[l] || 0);
        chartInstances['chart-address-type'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Match Rate %',
                    data,
                    backgroundColor: [
                        ALPHA(COLORS.perfect, 0.8),
                        ALPHA(COLORS.systemA, 0.8),
                        ALPHA(COLORS.partial, 0.8),
                        ALPHA(COLORS.high,    0.8),
                        ALPHA(COLORS.none,    0.6)
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` Match Rate: ${ctx.parsed.x}%` } }
                },
                scales: {
                    x: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' }
                    },
                    y: { grid: { display: false }, ticks: { color: defaultTickColor } }
                }
            }
        });
    }

    /**
     * Extended Chart 6: Field Importance Horizontal Bar
     */
    function renderFieldImportanceChart(fieldContribution) {
        const ctx = getCtx('chart-field-importance');
        if (!ctx) return;
        if (!fieldContribution || !fieldContribution.fieldImportance) return;
        const sorted = [...fieldContribution.fieldImportance].sort((a, b) => b.avgComponentScore - a.avgComponentScore);
        const labels = sorted.map(f => f.field);
        const data   = sorted.map(f => f.avgComponentScore);
        const bgColors = data.map(v => {
            const ratio = v / 100;
            const r = Math.round(37  + (37  - 37)  * ratio);
            const g = Math.round(99  + (150 - 99)  * ratio);
            const b = Math.round(235 + (235 - 235) * ratio);
            return `rgba(${r},${g},${b},${0.5 + ratio * 0.4})`;
        });
        chartInstances['chart-field-importance'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Avg Component Score',
                    data,
                    backgroundColor: bgColors,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` Score: ${ctx.parsed.x}%` } }
                },
                scales: {
                    x: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' }
                    },
                    y: { grid: { display: false }, ticks: { color: defaultTickColor } }
                }
            }
        });
    }

    /**
     * Extended Chart 7: Expanded Field Completeness Grouped Bar
     */
    function renderExpandedCompletenessChart(qualityA, qualityB) {
        const ctx = getCtx('chart-field-completeness-expanded');
        if (!ctx) return;
        const fields = ['Street', 'City', 'State', 'ZIP', 'Addr2', 'County', 'Lat', 'Lon', 'ZIP+4', 'Carrier Route', 'Delivery Pt'];
        const keys   = ['street', 'city', 'state', 'zip', 'addr2', 'county', 'lat', 'lon', 'zipPlus4', 'carrierRoute', 'deliveryPoint'];
        const fcA = (qualityA && qualityA.fieldCompleteness) || {};
        const fcB = (qualityB && qualityB.fieldCompleteness) || {};
        const dataA = keys.map(k => fcA[k] || 0);
        const dataB = keys.map(k => fcB[k] || 0);
        chartInstances['chart-field-completeness-expanded'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: fields,
                datasets: [
                    {
                        label: 'System A',
                        data: dataA,
                        backgroundColor: ALPHA(COLORS.systemA, 0.85),
                        borderRadius: 3
                    },
                    {
                        label: 'System B',
                        data: dataB,
                        backgroundColor: ALPHA(COLORS.systemB, 0.85),
                        borderRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: defaultTickColor, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor, font: { size: 9 } } },
                    y: {
                        min: 0, max: 100,
                        grid: { color: defaultGridColor },
                        ticks: { color: defaultTickColor, callback: (v) => v + '%' }
                    }
                }
            }
        });
    }

    /**
     * Extended Chart 8: Top Discrepancy Combos Horizontal Bar
     */
    function renderDiscrepancyCombosChart(discrepancyPatterns) {
        const ctx = getCtx('chart-discrepancy-combo');
        if (!ctx) return;
        if (!discrepancyPatterns || !discrepancyPatterns.comboFrequency) return;
        const entries = Object.entries(discrepancyPatterns.comboFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        const labels = entries.map(([k]) => k.length > 30 ? k.substring(0, 30) + '…' : k);
        const data   = entries.map(([, v]) => v);
        const redShades = [
            ALPHA(COLORS.none, 0.9),
            ALPHA(COLORS.none, 0.75),
            ALPHA(COLORS.none, 0.6),
            ALPHA(COLORS.none, 0.45),
            ALPHA(COLORS.none, 0.3)
        ];
        chartInstances['chart-discrepancy-combo'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Occurrences',
                    data,
                    backgroundColor: redShades.slice(0, data.length),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` Occurrences: ${ctx.parsed.x.toLocaleString()}` } }
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
     * Extended Chart 9: AI Score Histogram (20 buckets)
     */
    function renderAIScoreHistogram(extendedAIMetrics) {
        const ctx = getCtx('chart-ai-score-histogram');
        if (!ctx) return;
        if (!extendedAIMetrics || !extendedAIMetrics.aiScoreHistogram) return;
        const histogram = extendedAIMetrics.aiScoreHistogram;
        const labels = Array.from({ length: 20 }, (_, i) => {
            const lo = i * 5;
            const hi = lo + 4;
            return `${lo}-${hi === 99 ? 99 : hi}`;
        });
        labels[19] = '95-100';
        const bgColors = histogram.map((_, i) => {
            const mid = i * 5 + 2;
            if (mid < 50) return ALPHA(COLORS.none,    0.7);
            if (mid < 70) return ALPHA(COLORS.partial, 0.7);
            if (mid < 85) return ALPHA(COLORS.high,    0.7);
            return ALPHA(COLORS.perfect, 0.7);
        });
        chartInstances['chart-ai-score-histogram'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Records',
                    data: histogram,
                    backgroundColor: bgColors,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` Records: ${ctx.parsed.y.toLocaleString()}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: defaultTickColor, font: { size: 9 }, maxRotation: 45 } },
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
     * Extended Chart 10: Data Quality Gauge (two doughnut canvases)
     */
    function renderDataQualityGauge(qualityA, qualityB) {
        function _renderGauge(canvasId, score) {
            const ctx = getCtx(canvasId);
            if (!ctx) return;
            const safeScore = score || 0;
            const color = safeScore >= 80 ? COLORS.perfect : safeScore >= 60 ? COLORS.partial : COLORS.none;
            chartInstances[canvasId] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [safeScore, 100 - safeScore],
                        backgroundColor: [color, 'rgba(229,231,235,0.4)'],
                        borderColor: ['#FFFFFF', '#FFFFFF'],
                        borderWidth: 2,
                        hoverOffset: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => ` DQ Score: ${safeScore}%` } }
                    },
                    cutout: '70%'
                }
            });
        }
        _renderGauge('chart-dq-gauge-a', qualityA && qualityA.dataQualityScore);
        _renderGauge('chart-dq-gauge-b', qualityB && qualityB.dataQualityScore);
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
        renderMatchTypeDonut,
        renderComponentScoresBar,
        renderConfidenceBandChart,
        renderDQComparisonBar,
        renderAIScoreDistribution,
        renderAIVsTraditionalScatter,
        renderAIMetricsRadar,
        renderGeoDistanceChart,
        renderAddressTypeChart,
        renderFieldImportanceChart,
        renderExpandedCompletenessChart,
        renderDiscrepancyCombosChart,
        renderAIScoreHistogram,
        renderDataQualityGauge,
        exportChartPng,
        getChartDataUrl,
        chartInstances,
        COLORS
    };
})();
