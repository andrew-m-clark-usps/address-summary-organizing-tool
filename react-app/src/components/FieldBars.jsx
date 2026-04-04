import React from 'react';

export default function FieldBars({ completeness }) {
    if (!completeness) return null;
    const fields = [
        { key: 'street', label: 'Street' },
        { key: 'city',   label: 'City' },
        { key: 'state',  label: 'State' },
        { key: 'zip',    label: 'ZIP' },
    ];
    return (
        <div className="field-bars">
            {fields.map(({ key, label }) => (
                <div className="field-bar" key={key}>
                    <span className="field-name">{label}</span>
                    <div className="field-bar-track">
                        <div className="field-bar-fill" style={{ width: completeness[key] + '%' }} />
                    </div>
                    <span className="field-pct">{completeness[key]}%</span>
                </div>
            ))}
        </div>
    );
}
