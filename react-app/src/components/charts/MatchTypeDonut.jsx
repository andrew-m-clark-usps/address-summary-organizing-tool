import React from 'react';
import { Doughnut } from 'react-chartjs-2';

const COLORS = { perfect: '#059669', partial: '#D97706' };

export default function MatchTypeDonut({ matchDetails, chartRef }) {
    if (!matchDetails) return null;
    const data = {
        labels: ['Exact Matches', 'Fuzzy Matches'],
        datasets: [{
            data: [matchDetails.exactMatchCount, matchDetails.fuzzyMatchCount],
            backgroundColor: [COLORS.perfect, COLORS.partial],
            borderColor: '#FFFFFF',
            borderWidth: 2,
            hoverOffset: 6
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
