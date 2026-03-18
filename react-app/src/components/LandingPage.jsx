import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import FileUploadZone from './FileUploadZone';
import { matchRecords } from '../engine/matcher';
import { runFullAnalysis } from '../engine/analyzer';

export default function LandingPage() {
    const { state, dispatch } = useApp();
    const canRun = !!(state.dataA && state.dataB);

    function handleThresholdChange(e) {
        dispatch({ type: 'SET_THRESHOLD', payload: parseInt(e.target.value) });
    }

    function handleWeightChange(field, e) {
        dispatch({ type: 'SET_WEIGHTS', payload: { [field]: parseInt(e.target.value) } });
    }

    async function handleRunAnalysis() {
        if (!canRun) return;
        dispatch({ type: 'SET_LOADING', payload: { loading: true, text: 'Running address matching…', sub: 'This may take a moment for large datasets' } });
        await new Promise(r => setTimeout(r, 50));
        try {
            const matchStart = Date.now();
            const matchResults = matchRecords(
                state.dataA.records,
                state.dataB.records,
                { threshold: state.threshold, weights: state.weights }
            );
            const processingMs = Date.now() - matchStart;
            const analysis = runFullAnalysis(
                state.dataA.records,
                state.dataB.records,
                matchResults,
                processingMs
            );
            dispatch({ type: 'SET_MATCH_RESULTS', payload: matchResults });
            dispatch({ type: 'SET_ANALYSIS', payload: analysis });
            dispatch({ type: 'SET_LOADING', payload: { loading: false } });
            dispatch({ type: 'SET_TAB', payload: 'dashboard' });
            dispatch({ type: 'SET_VIEW', payload: 'analysis' });
        } catch (err) {
            dispatch({ type: 'SET_LOADING', payload: { loading: false } });
            alert('Analysis failed: ' + err.message);
        }
    }

    const { threshold, weights } = state;

    return (
        <div className="landing-page">
            <div className="landing-hero">
                <h1 className="landing-title">📊 Address Summary Organizing Tool</h1>
                <p className="landing-sub">Upload two address datasets and run AI-powered matching analysis</p>
            </div>

            <div className="landing-upload-grid">
                <div className="upload-section">
                    <div className="upload-section-header">
                        <span className="upload-system-badge badge-a">System A</span>
                        <h3>Primary Dataset</h3>
                    </div>
                    <FileUploadZone system="a" />
                    <div className="upload-sample-link">
                        <a href="/samples/sample_system_a.csv" download>⬇ Download sample file</a>
                    </div>
                </div>

                <div className="upload-vs">VS</div>

                <div className="upload-section">
                    <div className="upload-section-header">
                        <span className="upload-system-badge badge-b">System B</span>
                        <h3>Comparison Dataset</h3>
                    </div>
                    <FileUploadZone system="b" />
                    <div className="upload-sample-link">
                        <a href="/samples/sample_system_b.csv" download>⬇ Download sample file</a>
                    </div>
                </div>
            </div>

            <div className="landing-settings">
                <div className="settings-card">
                    <h3 className="settings-title">⚙️ Matching Settings</h3>

                    <div className="setting-row">
                        <label className="setting-label">
                            Match Threshold: <strong>{threshold}%</strong>
                        </label>
                        <input
                            type="range" min="0" max="100" value={threshold}
                            className="setting-slider"
                            onChange={handleThresholdChange}
                        />
                        <div className="setting-hint">Minimum confidence score to consider a match</div>
                    </div>

                    <div className="weights-grid">
                        {[
                            { key: 'zip',    label: 'ZIP Weight' },
                            { key: 'state',  label: 'State Weight' },
                            { key: 'city',   label: 'City Weight' },
                            { key: 'street', label: 'Street Weight' },
                        ].map(({ key, label }) => (
                            <div className="setting-row" key={key}>
                                <label className="setting-label">
                                    {label}: <strong>{weights[key]}</strong>
                                </label>
                                <input
                                    type="range" min="0" max="100" value={weights[key]}
                                    className="setting-slider"
                                    onChange={(e) => handleWeightChange(key, e)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="landing-actions">
                <button
                    className="btn btn-primary btn-lg"
                    disabled={!canRun}
                    onClick={handleRunAnalysis}
                >
                    🚀 Run Analysis
                </button>
                {!canRun && (
                    <p className="landing-hint">Please upload both System A and System B files to continue</p>
                )}
            </div>
        </div>
    );
}
