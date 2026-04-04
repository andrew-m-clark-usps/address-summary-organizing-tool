import React from 'react';

function esc(str) {
    if (!str) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return String(str);
}

export default function DataTable({ headers, rows, emptyMessage }) {
    return (
        <table>
            <thead>
                <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
                {rows.length === 0 ? (
                    <tr>
                        <td colSpan={headers.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            {emptyMessage || 'No records.'}
                        </td>
                    </tr>
                ) : rows.map((row, i) => (
                    <tr key={i}>
                        {row.map((cell, j) => <td key={j}>{typeof cell === 'string' ? esc(cell) : cell}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
