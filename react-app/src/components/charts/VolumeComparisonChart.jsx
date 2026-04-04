import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { perfect: '#059669', systemA: '#2563EB', systemB: '#D97706' };

export default function VolumeComparisonChart({ summary, chartRef }) {
    if (!summary) return null;
    const data = {
        labels: ['System A', 'System B'],
        datasets: [
            {
                label: 'Matched',
                data: [summary.matched, summary.matched],
                backgroundColor: COLORS.perfect,
                borderRadius: 4,
                stack: 'stack'
            },
            {
                label: 'Unique to System',
                data: [summary.unmatchedA, summary.unmatchedB],
                backgroundColor: [alpha(COLORS.systemA, 0.7), alpha(COLORS.systemB, 0.7)],
                borderRadius: 4,
                stack: 'stack'
            }
        ]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } }
        },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                ticks: { callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v },
                beginAtZero: true
            }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
