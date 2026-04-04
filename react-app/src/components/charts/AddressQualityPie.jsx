import React from 'react';
import { Doughnut } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { complete: '#059669', low: '#EA580C', partial: '#D97706', none: '#DC2626' };

export default function AddressQualityPie({ qualityA, chartRef }) {
    if (!qualityA) return null;
    const data = {
        labels: ['Complete', 'Missing ZIP', 'Missing City', 'Missing State', 'Multiple Missing'],
        datasets: [{
            data: [qualityA.complete, qualityA.missingZip, qualityA.missingCity, qualityA.missingState, qualityA.multiMissing],
            backgroundColor: [
                COLORS.complete, alpha(COLORS.low, 0.9), alpha(COLORS.partial, 0.9),
                alpha(COLORS.none, 0.7), COLORS.none
            ],
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
