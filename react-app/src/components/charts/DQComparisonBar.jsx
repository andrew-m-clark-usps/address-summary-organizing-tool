import React from 'react';
import { Bar } from 'react-chartjs-2';

const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const COLORS = { systemA: '#2563EB', systemB: '#D97706' };

export default function DQComparisonBar({ aiMetrics, chartRef }) {
    if (!aiMetrics) return null;
    const data = {
        labels: ['System A', 'System B'],
        datasets: [{
            label: 'Data Quality Score',
            data: [aiMetrics.dqScoreA, aiMetrics.dqScoreB],
            backgroundColor: [alpha(COLORS.systemA, 0.7), alpha(COLORS.systemB, 0.7)],
            borderColor: [COLORS.systemA, COLORS.systemB],
            borderWidth: 2,
            borderRadius: 6
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` DQ Score: ${ctx.parsed.y}%` } }
        },
        scales: {
            x: { grid: { display: false } },
            y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } }
        }
    };
    return <Bar ref={chartRef} data={data} options={options} />;
}
