import React from 'react';

const ICONS = { success: '✅', info: 'ℹ️', warning: '⚠️', danger: '❌' };

export default function AlertMessage({ type, message }) {
    if (!message) return null;
    return (
        <div className={`alert alert-${type}`}>
            <span>{ICONS[type] || 'ℹ️'}</span>
            <span>{message}</span>
        </div>
    );
}
