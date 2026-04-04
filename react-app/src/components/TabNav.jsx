import React from 'react';
import { useApp } from '../context/AppContext';

const TABS = [
    { id: 'dashboard',    label: '📊 Dashboard' },
    { id: 'match-summary', label: '🔗 Match Summary' },
    { id: 'geographic',   label: '🗺️ Geographic' },
    { id: 'quality',      label: '✅ Quality' },
    { id: 'ai-metrics',   label: '🤖 AI Metrics' },
    { id: 'detailed',     label: '📋 Detailed Results' },
    { id: 'export',       label: '📥 Export' },
];

export default function TabNav() {
    const { state, dispatch } = useApp();

    return (
        <nav className="tab-nav">
            {TABS.map(tab => (
                <button
                    key={tab.id}
                    className={`nav-tab ${state.currentTab === tab.id ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_TAB', payload: tab.id })}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}
