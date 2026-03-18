import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import StatCard from './StatCard';
import ChartCard from './ChartCard';
import MetricCard from './MetricCard';
import MatchDistributionPie from './charts/MatchDistributionPie';
import MatchSummaryBar from './charts/MatchSummaryBar';
import TopStatesChart from './charts/TopStatesChart';
import ConfidenceHistogram from './charts/ConfidenceHistogram';
import FieldCompletenessChart from './charts/FieldCompletenessChart';
import AddressQualityPie from './charts/AddressQualityPie';
import TopCitiesChart from './charts/TopCitiesChart';
import DiscrepancyChart from './charts/DiscrepancyChart';
import VolumeComparisonChart from './charts/VolumeComparisonChart';

function getMetricClass(value, thresholds) {
    if (value >= (thresholds.excellent || 90)) return 'metric-excellent';
    if (value >= (thresholds.good || 70)) return 'metric-good';
    if (value >= (thresholds.fair || 50)) return 'metric-fair';
    return 'metric-poor';
}

function exportChart(ref, filename) {
    const canvas = ref?.current?.canvas || ref?.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

export default function DashboardTab() {
    const { state, chartRefsRef } = useApp();
    const { analysis } = state;

    const refs = {
        matchDist: useRef(null),
        matchSummary: useRef(null),
        topStates: useRef(null),
        confidenceHist: useRef(null),
        fieldCompleteness: useRef(null),
        addressQuality: useRef(null),
        topCities: useRef(null),
        discrepancy: useRef(null),
        volume: useRef(null),
    };

    // Store refs for PowerPoint export
    React.useEffect(() => {
        if (chartRefsRef) {
            Object.entries(refs).forEach(([key, ref]) => {
                if (ref.current) {
                    const canvas = ref.current.canvas || ref.current;
                    chartRefsRef.current[key] = canvas;
                }
            });
        }
    });

    if (!analysis) return <div className="tab-empty">No analysis data available.</div>;

    const { summary, quality, geo, cities, aiMetrics } = analysis;

    return (
        <div className="tab-content active" id="tab-dashboard">
            {/* AI Insights Row */}
            {aiMetrics && (
                <div className="ai-insights-row">
                    <MetricCard
                        label="Overall Confidence Index"
                        value={aiMetrics.overallConfidence + '%'}
                        explain="Weighted composite of score, match rate & DQ"
                        colorClass={getMetricClass(aiMetrics.overallConfidence, { excellent: 85, good: 70, fair: 55 })}
                    />
                    <MetricCard
                        label="F1 Score"
                        value={aiMetrics.f1Score + '%'}
                        explain="Harmonic mean of precision & recall"
                        colorClass={getMetricClass(aiMetrics.f1Score, { excellent: 90, good: 75, fair: 60 })}
                    />
                    <MetricCard
                        label="DQ Score — System A"
                        value={aiMetrics.dqScoreA.toFixed(1) + '%'}
                        explain="Completeness, validity & duplicate penalty"
                        colorClass={getMetricClass(aiMetrics.dqScoreA, { excellent: 90, good: 75, fair: 60 })}
                    />
                    <MetricCard
                        label="DQ Score — System B"
                        value={aiMetrics.dqScoreB.toFixed(1) + '%'}
                        explain="Completeness, validity & duplicate penalty"
                        colorClass={getMetricClass(aiMetrics.dqScoreB, { excellent: 90, good: 75, fair: 60 })}
                    />
                </div>
            )}

            {/* Stat Cards */}
            <div className="stats-grid">
                <StatCard label="System A Total" value={summary.totalA.toLocaleString()} colorClass="stat-a" />
                <StatCard label="System B Total" value={summary.totalB.toLocaleString()} colorClass="stat-b" />
                <StatCard label="Matched" value={summary.matched.toLocaleString()} colorClass="stat-matched" />
                <StatCard label="Match Rate" value={summary.matchPct + '%'} colorClass="stat-rate" />
                <StatCard label="Perfect (100%)" value={summary.perfect.toLocaleString()} colorClass="stat-perfect" />
                <StatCard label="High (90-99%)" value={summary.high.toLocaleString()} colorClass="stat-high" />
                <StatCard label="Partial (70-89%)" value={summary.partial.toLocaleString()} colorClass="stat-partial" />
                <StatCard label="Unmatched A" value={summary.unmatchedA.toLocaleString()} colorClass="stat-unmatched" />
                <StatCard label="Unmatched B" value={summary.unmatchedB.toLocaleString()} colorClass="stat-unmatched" />
            </div>

            {/* Charts Grid */}
            <div className="charts-grid">
                <ChartCard title="Match Distribution" onExport={() => exportChart(refs.matchDist, 'match-distribution.png')}>
                    <MatchDistributionPie summary={summary} chartRef={refs.matchDist} />
                </ChartCard>
                <ChartCard title="Match Summary" onExport={() => exportChart(refs.matchSummary, 'match-summary.png')}>
                    <MatchSummaryBar summary={summary} chartRef={refs.matchSummary} />
                </ChartCard>
                <ChartCard title="Top States" onExport={() => exportChart(refs.topStates, 'top-states.png')}>
                    <TopStatesChart geoMatch={geo.geoMatch} chartRef={refs.topStates} />
                </ChartCard>
                <ChartCard title="Confidence Distribution" onExport={() => exportChart(refs.confidenceHist, 'confidence-histogram.png')}>
                    <ConfidenceHistogram histogram={summary.histogram} chartRef={refs.confidenceHist} />
                </ChartCard>
                <ChartCard title="Data Completeness" onExport={() => exportChart(refs.fieldCompleteness, 'field-completeness.png')}>
                    <FieldCompletenessChart qualityA={quality.a} qualityB={quality.b} chartRef={refs.fieldCompleteness} />
                </ChartCard>
                <ChartCard title="Address Quality (Sys A)" onExport={() => exportChart(refs.addressQuality, 'address-quality.png')}>
                    <AddressQualityPie qualityA={quality.a} chartRef={refs.addressQuality} />
                </ChartCard>
                <ChartCard title="Top Cities" onExport={() => exportChart(refs.topCities, 'top-cities.png')}>
                    <TopCitiesChart cities={cities} chartRef={refs.topCities} />
                </ChartCard>
                <ChartCard title="Discrepancy Types" onExport={() => exportChart(refs.discrepancy, 'discrepancy-types.png')}>
                    <DiscrepancyChart discrepancyTypes={summary.discrepancyTypes} chartRef={refs.discrepancy} />
                </ChartCard>
                <ChartCard title="Record Volume" onExport={() => exportChart(refs.volume, 'volume-comparison.png')}>
                    <VolumeComparisonChart summary={summary} chartRef={refs.volume} />
                </ChartCard>
            </div>
        </div>
    );
}
