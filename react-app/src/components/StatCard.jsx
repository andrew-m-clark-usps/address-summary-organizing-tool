import React from 'react';

export default function StatCard({ label, value, sub, colorClass }) {
    return (
        <div className={`stat-card ${colorClass || ''}`}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
            {sub && <div className="stat-sub">{sub}</div>}
        </div>
    );
}
