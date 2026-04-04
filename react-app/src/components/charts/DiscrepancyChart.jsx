import React from 'react';
import { Doughnut } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { none: '#DC2626', low: '#EA580C', partial: '#D97706', high: '#65A30D', systemB: '#D97706', perfect: '#059669' };

export default function DiscrepancyChart({ discrepancyTypes, chartRef }) {
    if (!discrepancyTypes) return null;
    const entries = Object.entries(discrepancyTypes).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([k]) => k);
    const dataVals = entries.map(([, v]) => v);
    const bgColors = [COLORS.none, alpha(COLORS.low, 0.9), COLORS.partial, COLORS.high, alpha(COLORS.systemB, 0.8)];
    const data = {
        labels: labels.length ? labels : ['No Discrepancies'],
        datasets: [{
            data: dataVals.length ? dataVals : [1],
            backgroundColor: dataVals.length ? bgColors.slice(0, labels.length) : [COLORS.perfect],
            borderColor: '#FFFFFF',
            borderWidth: 2,
            hoverOffset: 6
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const p = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                        return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${p}%)`;
                    }
                }
            }
        },
        cutout: '55%'
    };
    return <Doughnut ref={chartRef} data={data} options={options} />;
}
