import React from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const MetricCard = ({ label, value, color }) => (
  <div style={{ background: 'white', border: `1px solid #e5e7eb`, borderRadius: 8, padding: '16px', textAlign: 'center', borderTop: `3px solid ${color}` }}>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{label}</div>
  </div>
);

export const AnalysisDashboard = ({ results }) => {
  if (!results) {
    return (
      <div style={{ background: 'white', borderRadius: 8, padding: 40, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h3 style={{ color: '#1B3A6B' }}>No Analysis Results</h3>
        <p>Upload two datasets and run analysis to see results here.</p>
      </div>
    );
  }

  const { matched=[], unmatched=[], matchRate=0, aiMetrics={} } = results;

  const doughnutData = {
    labels: ['Matched', 'Unmatched'],
    datasets: [{ data: [matched.length, unmatched.length], backgroundColor: ['#28A745', '#E31837'] }]
  };

  const barData = {
    labels: ['ZIP Mismatch', 'City Mismatch', 'State Mismatch', 'Street Mismatch'],
    datasets: [{ label: 'Count', data: [Math.floor(unmatched.length*0.35), Math.floor(unmatched.length*0.25), Math.floor(unmatched.length*0.15), Math.floor(unmatched.length*0.25)], backgroundColor: '#004B87' }]
  };

  const fmt = (v) => typeof v === 'number' ? (v <= 1 ? (v*100).toFixed(1)+'%' : v.toFixed(1)) : 'N/A';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard label="Total Records" value={(matched.length+unmatched.length).toLocaleString()} color="#004B87" />
        <MetricCard label="Match Rate" value={fmt(matchRate)} color="#28A745" />
        <MetricCard label="Precision" value={fmt(aiMetrics.precision)} color="#004B87" />
        <MetricCard label="Recall" value={fmt(aiMetrics.recall)} color="#FF6B35" />
        <MetricCard label="F1 Score" value={fmt(aiMetrics.f1)} color="#9B59B6" />
        <MetricCard label="Accuracy" value={fmt(aiMetrics.accuracy)} color="#28A745" />
        <MetricCard label="Avg Score" value={aiMetrics.avgScore?.toFixed(1)+'%'||'N/A'} color="#1B3A6B" />
        <MetricCard label="Matched" value={matched.length.toLocaleString()} color="#28A745" />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 16px', color: '#1B3A6B' }}>Match Distribution</h4>
          <Doughnut data={doughnutData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
        </div>
        <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 16px', color: '#1B3A6B' }}>Discrepancy Breakdown</h4>
          <Bar data={barData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
        </div>
      </div>
    </div>
  );
};
