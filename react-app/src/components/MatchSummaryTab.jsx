import React from 'react';
import { useApp } from '../context/AppContext';
import StatCard from './StatCard';

export default function MatchSummaryTab() {
    const { state } = useApp();
    const { analysis } = state;
    if (!analysis) return <div className="tab-empty">No analysis data available.</div>;

    const { summary, quality } = analysis;

    return (
        <div className="tab-content active" id="tab-match-summary">
            <h2 className="tab-title">🔗 Match Summary</h2>

            <div className="stats-grid">
                <StatCard label="System A Total" value={summary.totalA.toLocaleString()} colorClass="stat-a" />
                <StatCard label="System B Total" value={summary.totalB.toLocaleString()} colorClass="stat-b" />
                <StatCard label="Matched" value={summary.matched.toLocaleString()} colorClass="stat-matched" />
                <StatCard label="Match Rate" value={summary.matchPct + '%'} colorClass="stat-rate" />
                <StatCard label="Perfect (100%)" value={summary.perfect.toLocaleString()} colorClass="stat-perfect" />
                <StatCard label="High (90-99%)" value={summary.high.toLocaleString()} colorClass="stat-high" />
                <StatCard label="Partial (70-89%)" value={summary.partial.toLocaleString()} colorClass="stat-partial" />
                <StatCard label="Low (50-69%)" value={summary.low.toLocaleString()} />
                <StatCard label="No Match (<50%)" value={summary.veryLow.toLocaleString()} colorClass="stat-unmatched" />
                <StatCard label="Unmatched A" value={summary.unmatchedA.toLocaleString()} colorClass="stat-unmatched" />
                <StatCard label="Unmatched B" value={summary.unmatchedB.toLocaleString()} colorClass="stat-unmatched" />
            </div>

            <div className="match-rate-bar-section">
                <div className="match-rate-label">Overall Match Rate: <strong>{summary.matchPct}%</strong></div>
                <div className="match-rate-track">
                    <div className="match-rate-fill" style={{ width: summary.matchPct + '%' }} />
                </div>
            </div>

            <div className="section-divider">
                <h3>Discrepancy Breakdown</h3>
            </div>
            <div className="discrepancy-list">
                {Object.keys(summary.discrepancyTypes).length === 0 ? (
                    <div className="empty-state">✅ No discrepancies found in matched records.</div>
                ) : (
                    Object.entries(summary.discrepancyTypes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                            <div className="discrepancy-item" key={type}>
                                <span className="disc-type">{type}</span>
                                <span className="disc-count">{count.toLocaleString()}</span>
                                <span className="disc-pct">{summary.matched > 0 ? Math.round((count / summary.matched) * 100) : 0}% of matched</span>
                            </div>
                        ))
                )}
            </div>
        </div>
    );
}
