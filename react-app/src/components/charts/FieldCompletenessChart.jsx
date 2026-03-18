import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { systemA: '#2563EB', systemB: '#D97706' };

export default function FieldCompletenessChart({ qualityA, qualityB, chartRef }) {
    if (!qualityA || !qualityB) return null;
    const fields = ['Street', 'City', 'State', 'ZIP'];
    const dataA = [qualityA.fieldCompleteness.street, qualityA.fieldCompleteness.city, qualityA.fieldCompleteness.state, qualityA.fieldCompleteness.zip];
    const dataB = [qualityB.fieldCompleteness.street, qualityB.fieldCompleteness.city, qualityB.fieldCompleteness.state, qualityB.fieldCompleteness.zip];
    const data = {
        labels: fields,
        datasets: [
            { label: 'System A', data: dataA, backgroundColor: alpha(COLORS.systemA, 0.85), borderRadius: 4 },
            { label: 'System B', data: dataB, backgroundColor: alpha(COLORS.systemB, 0.85), borderRadius: 4 }
        ]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } }
        },
        scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: (v) => v + '%' }, min: 0, max: 100 }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
