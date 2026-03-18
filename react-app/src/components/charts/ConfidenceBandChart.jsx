import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { none: '#DC2626', partial: '#D97706', perfect: '#059669' };

export default function ConfidenceBandChart({ matchDetails, chartRef }) {
    if (!matchDetails) return null;
    const p = matchDetails.scorePercentiles;
    const data = {
        labels: ['P10', 'P25', 'P50 (Median)', 'P75', 'P90'],
        datasets: [{
            label: 'Percentile Score',
            data: [p.p10, p.p25, p.p50, p.p75, p.p90],
            backgroundColor: [
                alpha(COLORS.none, 0.6), alpha(COLORS.partial, 0.6), alpha(COLORS.perfect, 0.8),
                alpha(COLORS.partial, 0.6), alpha(COLORS.none, 0.6)
            ],
            borderColor: [COLORS.none, COLORS.partial, COLORS.perfect, COLORS.partial, COLORS.none],
            borderWidth: 1.5,
            borderRadius: 4
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.y}%` } }
        },
        scales: {
            x: { grid: { display: false } },
            y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
