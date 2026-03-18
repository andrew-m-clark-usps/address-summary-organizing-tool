import React from 'react';
import { useApp } from '../context/AppContext';

export default function LoadingOverlay() {
    const { state } = useApp();
    if (!state.loading) return null;
    return (
        <div className="loading-overlay visible">
            <div className="loading-content">
                <div className="loading-spinner"></div>
                <div className="loading-text">{state.loadingText || 'Processing…'}</div>
                {state.loadingSub && <div className="loading-sub">{state.loadingSub}</div>}
            </div>
        </div>
    );
}
