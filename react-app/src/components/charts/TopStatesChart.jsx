import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { perfect: '#059669', systemA: '#2563EB', systemB: '#D97706' };

export default function TopStatesChart({ geoMatch, chartRef }) {
    if (!geoMatch) return null;
    const top = geoMatch.slice(0, 15);
    const data = {
        labels: top.map(s => s.state),
        datasets: [
            {
                label: 'Matched',
                data: top.map(s => s.matched),
                backgroundColor: COLORS.perfect,
                borderRadius: 3,
                stack: 'stack'
            },
            {
                label: 'Unmatched A',
                data: top.map(s => s.unmatchedA),
                backgroundColor: alpha(COLORS.systemA, 0.7),
                borderRadius: 3,
                stack: 'stack'
            },
            {
                label: 'Unmatched B',
                data: top.map(s => s.unmatchedB),
                backgroundColor: alpha(COLORS.systemB, 0.7),
                borderRadius: 3,
                stack: 'stack'
            }
        ]
    };
    const options = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString()}` } }
        },
        scales: {
            x: { stacked: true, ticks: { callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } },
            y: { stacked: true, grid: { display: false } }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
