import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { systemA: '#2563EB', perfect: '#059669', high: '#65A30D', partial: '#D97706' };

export default function ComponentScoresBar({ matchDetails, chartRef }) {
    if (!matchDetails) return null;
    const data = {
        labels: ['Street', 'City', 'State', 'ZIP'],
        datasets: [{
            label: 'Avg Component Score',
            data: [matchDetails.avgStreetScore, matchDetails.avgCityScore, matchDetails.avgStateScore, matchDetails.avgZipScore],
            backgroundColor: [
                alpha(COLORS.systemA, 0.7), alpha(COLORS.perfect, 0.7),
                alpha(COLORS.high, 0.7), alpha(COLORS.partial, 0.7)
            ],
            borderColor: [COLORS.systemA, COLORS.perfect, COLORS.high, COLORS.partial],
            borderWidth: 1.5,
            borderRadius: 4
        }]
    };
    const options = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` Score: ${ctx.parsed.x}%` } }
        },
        scales: {
            x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } },
            y: { grid: { display: false } }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
