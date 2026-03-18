import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { none: '#DC2626', low: '#EA580C', partial: '#D97706', high: '#65A30D', perfect: '#059669' };

export default function ConfidenceHistogram({ histogram, chartRef }) {
    if (!histogram) return null;
    const labels = ['0-9%','10-19%','20-29%','30-39%','40-49%','50-59%','60-69%','70-79%','80-89%','90-100%'];
    const bgColors = [
        COLORS.none, COLORS.none, COLORS.none, COLORS.none, COLORS.none,
        alpha(COLORS.low, 0.8), alpha(COLORS.low, 0.9), COLORS.partial, COLORS.high, COLORS.perfect
    ];
    const data = {
        labels,
        datasets: [{
            label: 'Records',
            data: histogram,
            backgroundColor: bgColors,
            borderRadius: 3
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` Records: ${ctx.parsed.y.toLocaleString()}` } }
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: {
                ticks: { callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v },
                beginAtZero: true
            }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
