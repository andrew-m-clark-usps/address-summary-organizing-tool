import React from 'react';
import { Doughnut } from 'react-chartjs-2';

const COLORS = {
    perfect: '#059669', high: '#65A30D', partial: '#D97706', low: '#EA580C', none: '#DC2626'
};

export default function MatchDistributionPie({ summary, chartRef }) {
    if (!summary) return null;
    const data = {
        labels: ['Perfect (100%)', 'High (90-99%)', 'Partial (70-89%)', 'Low (50-69%)', 'No Match (<50%)'],
        datasets: [{
            data: [summary.perfect, summary.high, summary.partial, summary.low, summary.veryLow],
            backgroundColor: [COLORS.perfect, COLORS.high, COLORS.partial, COLORS.low, COLORS.none],
            borderColor: '#FFFFFF',
            borderWidth: 2,
            hoverOffset: 8
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
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
