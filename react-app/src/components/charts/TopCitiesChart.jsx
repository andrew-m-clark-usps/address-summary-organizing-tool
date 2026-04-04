import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { systemA: '#2563EB', systemB: '#D97706' };

export default function TopCitiesChart({ cities, chartRef }) {
    if (!cities) return null;
    const top = cities.slice(0, 10);
    const data = {
        labels: top.map(c => c.city.length > 14 ? c.city.substring(0, 14) + '…' : c.city),
        datasets: [
            { label: 'System A', data: top.map(c => c.countA), backgroundColor: alpha(COLORS.systemA, 0.85), borderRadius: 4 },
            { label: 'System B', data: top.map(c => c.countB), backgroundColor: alpha(COLORS.systemB, 0.85), borderRadius: 4 }
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
            x: { ticks: { callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
