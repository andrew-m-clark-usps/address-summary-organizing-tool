import React from 'react';

export default function ChartCard({ title, children, onExport, exportLabel }) {
    return (
        <div className="chart-card">
            <div className="chart-card-header">
                <span className="chart-card-title">{title}</span>
                {onExport && (
                    <button className="btn btn-sm btn-secondary" onClick={onExport} title="Export as PNG">
                        ⬇ PNG
                    </button>
                )}
            </div>
            <div className="chart-card-body">
                {children}
            </div>
        </div>
    );
}
