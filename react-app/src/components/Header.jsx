import React from 'react';
import { useApp } from '../context/AppContext';

export default function Header() {
    const { state, dispatch } = useApp();

    function handleStartOver() {
        dispatch({ type: 'RESET' });
    }

    return (
        <header className="app-header">
            <div className="header-left">
                <span className="header-icon">📊</span>
                <div>
                    <div className="header-title">Address Summary Organizing Tool</div>
                    <div className="header-sub">AI-Powered Address Matching &amp; Analysis</div>
                </div>
            </div>
            <div className="header-right">
                {state.view === 'landing' && (
                    <div id="header-landing-actions">
                        <span className="header-badge">v2.0</span>
                    </div>
                )}
                {state.view === 'analysis' && (
                    <div id="header-analysis-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={handleStartOver}>
                            ↺ Start Over
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
