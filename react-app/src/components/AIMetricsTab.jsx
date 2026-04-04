import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import MetricCard from './MetricCard';
import ChartCard from './ChartCard';
import MatchTypeDonut from './charts/MatchTypeDonut';
import ComponentScoresBar from './charts/ComponentScoresBar';
import ConfidenceBandChart from './charts/ConfidenceBandChart';
import DQComparisonBar from './charts/DQComparisonBar';

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

export default function AIMetricsTab() {
    const { state, chartRefsRef } = useApp();
    const { analysis } = state;

    const matchTypeRef = useRef(null);
    const componentRef = useRef(null);
    const bandRef = useRef(null);
    const dqRef = useRef(null);

    React.useEffect(() => {
        if (chartRefsRef) {
            const map = { matchTypeDonut: matchTypeRef, componentScores: componentRef, confidenceBand: bandRef, dqComparison: dqRef };
            Object.entries(map).forEach(([key, ref]) => {
                if (ref.current) {
                    chartRefsRef.current[key] = ref.current.canvas || ref.current;
                }
            });
        }
    });

    if (!analysis) return <div className="tab-empty">No analysis data available.</div>;

    const { aiMetrics, matchDetails } = analysis;
    if (!aiMetrics) return <div className="tab-empty">No AI metrics available.</div>;

    const { p10, p25, p50, p75, p90 } = matchDetails?.scorePercentiles || {};

    return (
        <div className="tab-content active" id="tab-ai-metrics">
            <h2 className="tab-title">🤖 AI / ML Metrics</h2>

            {/* AI Performance Overview */}
            <div className="section-header">AI Performance Overview</div>
            <div className="metrics-grid">
                <MetricCard label="Precision" value={aiMetrics.precision + '%'}
                    explain="True matches / (true + false positives)"
                    colorClass={getMetricClass(aiMetrics.precision, { excellent: 90, good: 75, fair: 60 })} />
                <MetricCard label="Recall" value={aiMetrics.recall + '%'}
                    explain="Matched / min(total A, total B)"
                    colorClass={getMetricClass(aiMetrics.recall, { excellent: 90, good: 75, fair: 60 })} />
                <MetricCard label="F1 Score" value={aiMetrics.f1Score + '%'}
                    explain="Harmonic mean of precision & recall"
                    colorClass={getMetricClass(aiMetrics.f1Score, { excellent: 90, good: 75, fair: 60 })} />
                <MetricCard label="Accuracy" value={aiMetrics.accuracy + '%'}
                    explain="High-confidence matches / total matched"
                    colorClass={getMetricClass(aiMetrics.accuracy, { excellent: 80, good: 60, fair: 40 })} />
                <MetricCard label="Confidence Index" value={aiMetrics.overallConfidence + '%'}
                    explain="Weighted composite of score, match rate & DQ"
                    colorClass={getMetricClass(aiMetrics.overallConfidence, { excellent: 85, good: 70, fair: 55 })} />
                <MetricCard label="Jaccard Index" value={aiMetrics.jaccardIndex + '%'}
                    explain="Intersection / union of both datasets"
                    colorClass={getMetricClass(aiMetrics.jaccardIndex, { excellent: 70, good: 50, fair: 30 })} />
            </div>

            {/* DQ Scores */}
            <div className="section-header">Data Quality Scores</div>
            <div className="metrics-grid">
                <MetricCard label="DQ Score — System A" value={aiMetrics.dqScoreA.toFixed(1) + '%'}
                    explain="Completeness, validity & duplicate penalty"
                    colorClass={getMetricClass(aiMetrics.dqScoreA, { excellent: 90, good: 75, fair: 60 })} />
                <MetricCard label="DQ Score — System B" value={aiMetrics.dqScoreB.toFixed(1) + '%'}
                    explain="Completeness, validity & duplicate penalty"
                    colorClass={getMetricClass(aiMetrics.dqScoreB, { excellent: 90, good: 75, fair: 60 })} />
            </div>

            {/* Match Score Statistics */}
            {matchDetails && (
                <>
                    <div className="section-header">Match Score Statistics</div>
                    <div className="ai-stats-grid">
                        <div className="ai-stat"><span>Avg Score</span><strong>{matchDetails.avgMatchScore.toFixed(1)}%</strong></div>
                        <div className="ai-stat"><span>Median Score</span><strong>{matchDetails.medianMatchScore.toFixed(1)}%</strong></div>
                        <div className="ai-stat"><span>Std Dev</span><strong>{matchDetails.stdDevMatchScore.toFixed(1)}</strong></div>
                        <div className="ai-stat"><span>Min Score</span><strong>{matchDetails.minMatchScore}%</strong></div>
                        <div className="ai-stat"><span>Max Score</span><strong>{matchDetails.maxMatchScore}%</strong></div>
                        <div className="ai-stat"><span>P10</span><strong>{matchDetails.scorePercentiles.p10}%</strong></div>
                        <div className="ai-stat"><span>P25</span><strong>{matchDetails.scorePercentiles.p25}%</strong></div>
                        <div className="ai-stat"><span>P50</span><strong>{matchDetails.scorePercentiles.p50}%</strong></div>
                        <div className="ai-stat"><span>P75</span><strong>{matchDetails.scorePercentiles.p75}%</strong></div>
                        <div className="ai-stat"><span>P90</span><strong>{matchDetails.scorePercentiles.p90}%</strong></div>
                    </div>

                    <div className="section-header">Per-Component Scores</div>
                    <div className="ai-stats-grid">
                        <div className="ai-stat"><span>Street</span><strong>{matchDetails.avgStreetScore.toFixed(1)}%</strong></div>
                        <div className="ai-stat"><span>City</span><strong>{matchDetails.avgCityScore.toFixed(1)}%</strong></div>
                        <div className="ai-stat"><span>State</span><strong>{matchDetails.avgStateScore.toFixed(1)}%</strong></div>
                        <div className="ai-stat"><span>ZIP</span><strong>{matchDetails.avgZipScore.toFixed(1)}%</strong></div>
                    </div>

                    <div className="section-header">Match Type Counts</div>
                    <div className="ai-stats-grid">
                        <div className="ai-stat"><span>Exact Matches</span><strong>{matchDetails.exactMatchCount.toLocaleString()}</strong></div>
                        <div className="ai-stat"><span>Fuzzy Matches</span><strong>{matchDetails.fuzzyMatchCount.toLocaleString()}</strong></div>
                    </div>

                    <div className="section-header">Cross-Field Mismatches</div>
                    <div className="ai-stats-grid">
                        <div className="ai-stat"><span>Cross-State</span><strong>{matchDetails.crossStateMatchCount.toLocaleString()}</strong></div>
                        <div className="ai-stat"><span>Cross-ZIP</span><strong>{matchDetails.crossZipMatchCount.toLocaleString()}</strong></div>
                        <div className="ai-stat"><span>Cross-City</span><strong>{matchDetails.crossCityMatchCount.toLocaleString()}</strong></div>
                        <div className="ai-stat"><span>Discrepancy Rate</span><strong>{matchDetails.discrepancyRate}%</strong></div>
                        <div className="ai-stat"><span>Avg Disc/Match</span><strong>{matchDetails.avgDiscrepanciesPerMatch.toFixed(2)}</strong></div>
                        <div className="ai-stat"><span>w/ Secondary Unit</span><strong>{matchDetails.matchedWithSecondaryUnit.toLocaleString()}</strong></div>
                    </div>
                </>
            )}

            {/* Risk & Anomaly */}
            <div className="section-header">Risk &amp; Anomaly Indicators</div>
            <div className="metrics-grid">
                <MetricCard label="False Positive Risk" value={aiMetrics.falsePositiveRisk + '%'}
                    explain="Borderline matches near threshold"
                    colorClass={getMetricClass(100 - aiMetrics.falsePositiveRisk, { excellent: 85, good: 70, fair: 55 })} />
                <MetricCard label="Anomaly Rate" value={aiMetrics.anomalyRate + '%'}
                    explain="Duplicate or invalid ZIP/state records"
                    colorClass={getMetricClass(100 - aiMetrics.anomalyRate, { excellent: 95, good: 85, fair: 70 })} />
                <MetricCard label="Entropy" value={aiMetrics.entropy.toFixed(2)}
                    explain="Shannon entropy of score distribution (0–3.32)" />
                <MetricCard label="Gini Coefficient" value={aiMetrics.giniCoefficient.toFixed(3)}
                    explain="Score inequality (0=equal, 1=max inequality)" />
                <MetricCard label="Cosine Similarity" value={aiMetrics.cosineSimilarity + '%'}
                    explain="Geographic state-vector similarity between datasets"
                    colorClass={getMetricClass(aiMetrics.cosineSimilarity, { excellent: 90, good: 75, fair: 50 })} />
            </div>

            {/* Coverage */}
            <div className="section-header">Coverage &amp; Processing</div>
            <div className="ai-stats-grid">
                <div className="ai-stat"><span>Coverage Rate A</span><strong>{aiMetrics.coverageRateA.toFixed(1)}%</strong></div>
                <div className="ai-stat"><span>Coverage Rate B</span><strong>{aiMetrics.coverageRateB.toFixed(1)}%</strong></div>
                <div className="ai-stat"><span>Processing Efficiency</span>
                    <strong>{aiMetrics.processingEfficiency > 0 ? aiMetrics.processingEfficiency.toLocaleString() + ' rec/s' : 'N/A'}</strong>
                </div>
            </div>

            {/* Confidence Band Visual */}
            {matchDetails && (
                <>
                    <div className="section-header">Confidence Band</div>
                    <div className="confidence-band-section">
                        <div className="confidence-band-stats">
                            <span>P10: {p10}%</span>
                            <span>P25: {p25}%</span>
                            <span>P50: {p50}%</span>
                            <span>P75: {p75}%</span>
                            <span>P90: {p90}%</span>
                        </div>
                        <div className="confidence-band-track">
                            <div className="confidence-band-range" style={{ left: p10 + '%', width: (p90 - p10) + '%' }} />
                            <div className="confidence-band-iqr" style={{ left: p25 + '%', width: (p75 - p25) + '%' }} />
                            <div className="confidence-band-median" style={{ left: p50 + '%' }} />
                        </div>
                    </div>
                </>
            )}

            {/* AI Charts */}
            <div className="section-header">AI Charts</div>
            <div className="charts-grid">
                <ChartCard title="Match Type" onExport={() => exportChart(matchTypeRef, 'match-type-donut.png')}>
                    <MatchTypeDonut matchDetails={matchDetails} chartRef={matchTypeRef} />
                </ChartCard>
                <ChartCard title="Component Scores" onExport={() => exportChart(componentRef, 'component-scores.png')}>
                    <ComponentScoresBar matchDetails={matchDetails} chartRef={componentRef} />
                </ChartCard>
                <ChartCard title="Confidence Band" onExport={() => exportChart(bandRef, 'confidence-band.png')}>
                    <ConfidenceBandChart matchDetails={matchDetails} chartRef={bandRef} />
                </ChartCard>
                <ChartCard title="DQ Comparison" onExport={() => exportChart(dqRef, 'dq-comparison.png')}>
                    <DQComparisonBar aiMetrics={aiMetrics} chartRef={dqRef} />
                </ChartCard>
            </div>
        </div>
    );
}
