import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { systemA: '#2563EB', systemB: '#D97706', perfect: '#059669' };

export default function MatchSummaryBar({ summary, chartRef }) {
    if (!summary) return null;
    const data = {
        labels: ['System A Total', 'System B Total', 'Matched', 'Unmatched A', 'Unmatched B'],
        datasets: [{
            label: 'Records',
            data: [summary.totalA, summary.totalB, summary.matched, summary.unmatchedA, summary.unmatchedB],
            backgroundColor: [
                COLORS.systemA, COLORS.systemB, COLORS.perfect,
                alpha(COLORS.systemA, 0.6), alpha(COLORS.systemB, 0.6)
            ],
            borderRadius: 4
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.y.toLocaleString()}` } }
        },
        scales: {
            x: { ticks: {} },
            y: {
                ticks: { callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v },
                beginAtZero: true
            }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
