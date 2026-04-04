import React from 'react';

const StatCard = ({ title, value, color, icon }) => (
  <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '20px 24px', borderTop: `4px solid ${color}`, flex: 1 }}>
    <div style={{ fontSize: 32, fontWeight: 700, color: '#1a1a1a' }}>{value?.toLocaleString()}</div>
    <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>{icon} {title}</div>
  </div>
);

export const DashboardOverview = ({ stats }) => {
  const s = stats || { totalAddresses: 1250, pendingEdits: 12, verifiedAddresses: 1210, issuesFound: 4 };
  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
      <StatCard title="Total Addresses" value={s.totalAddresses} color="#004B87" icon="📊" />
      <StatCard title="Pending Edits" value={s.pendingEdits} color="#FF6B35" icon="✏️" />
      <StatCard title="Verified Addresses" value={s.verifiedAddresses} color="#28A745" icon="✅" />
      <StatCard title="Issues Found" value={s.issuesFound} color="#E31837" icon="⚠️" />
    </div>
  );
};
