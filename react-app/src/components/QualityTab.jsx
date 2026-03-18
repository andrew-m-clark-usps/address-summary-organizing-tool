import React from 'react';
import { useApp } from '../context/AppContext';
import StatCard from './StatCard';
import FieldBars from './FieldBars';

export default function QualityTab() {
    const { state } = useApp();
    const { analysis } = state;
    if (!analysis) return <div className="tab-empty">No analysis data available.</div>;

    const { quality } = analysis;
    const { a, b } = quality;

    return (
        <div className="tab-content active" id="tab-quality">
            <h2 className="tab-title">✅ Address Quality Analysis</h2>

            <div className="quality-grid">
                <div className="quality-system-card">
                    <h3>System A</h3>
                    <div className="quality-stats">
                        <StatCard label="Complete" value={a.complete.toLocaleString()} colorClass="stat-matched" />
                        <StatCard label="Incomplete" value={a.incomplete.toLocaleString()} colorClass="stat-unmatched" />
                        <StatCard label="Invalid ZIP" value={a.invalidZip.toLocaleString()} />
                        <StatCard label="Duplicates" value={a.duplicates.toLocaleString()} />
                    </div>
                    <div className="quality-completeness">
                        <h4>Field Completeness</h4>
                        <FieldBars completeness={a.fieldCompleteness} />
                    </div>
                    <div className="quality-details">
                        <div className="quality-detail-row">
                            <span>Complete Addresses</span>
                            <strong>{a.completePct}%</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Avg Fields Populated</span>
                            <strong>{a.avgFieldsPopulated}</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Secondary Units (APT/STE)</span>
                            <strong>{a.recordsWithSecondaryUnit.toLocaleString()}</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>ZIP+4 Count</span>
                            <strong>{a.hasZipPlus4Count.toLocaleString()}</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Standardized Street %</span>
                            <strong>{a.standardizedStreetPct}%</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Invalid State</span>
                            <strong>{a.invalidState.toLocaleString()}</strong>
                        </div>
                    </div>
                </div>

                <div className="quality-system-card">
                    <h3>System B</h3>
                    <div className="quality-stats">
                        <StatCard label="Complete" value={b.complete.toLocaleString()} colorClass="stat-matched" />
                        <StatCard label="Incomplete" value={b.incomplete.toLocaleString()} colorClass="stat-unmatched" />
                        <StatCard label="Invalid ZIP" value={b.invalidZip.toLocaleString()} />
                        <StatCard label="Duplicates" value={b.duplicates.toLocaleString()} />
                    </div>
                    <div className="quality-completeness">
                        <h4>Field Completeness</h4>
                        <FieldBars completeness={b.fieldCompleteness} />
                    </div>
                    <div className="quality-details">
                        <div className="quality-detail-row">
                            <span>Complete Addresses</span>
                            <strong>{b.completePct}%</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Avg Fields Populated</span>
                            <strong>{b.avgFieldsPopulated}</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Secondary Units (APT/STE)</span>
                            <strong>{b.recordsWithSecondaryUnit.toLocaleString()}</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>ZIP+4 Count</span>
                            <strong>{b.hasZipPlus4Count.toLocaleString()}</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Standardized Street %</span>
                            <strong>{b.standardizedStreetPct}%</strong>
                        </div>
                        <div className="quality-detail-row">
                            <span>Invalid State</span>
                            <strong>{b.invalidState.toLocaleString()}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
