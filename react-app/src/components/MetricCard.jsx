import React from 'react';

export default function MetricCard({ label, value, explain, colorClass }) {
    return (
        <div className={`metric-card ${colorClass || ''}`}>
            <div className="metric-value">{value}</div>
            <div className="metric-label">{label}</div>
            {explain && <div className="metric-explain">{explain}</div>}
        </div>
    );
}
