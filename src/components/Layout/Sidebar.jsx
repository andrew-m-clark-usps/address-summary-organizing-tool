import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { path: '/addresses', icon: '📍', label: 'My Addresses' },
  { path: '/upload', icon: '⬆', label: 'Upload Data' },
  { path: '/settings', icon: '⚙', label: 'Settings' },
];

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav style={{ width: 200, background: '#15305A', minHeight: 'calc(100vh - 60px)', padding: '16px 0', flexShrink: 0 }}>
      {navItems.map(item => {
        const active = location.pathname.startsWith(item.path);
        return (
          <button key={item.path} onClick={() => navigate(item.path)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 20px', background: active ? '#1F4080' : 'transparent', color: active ? 'white' : '#8aafcd', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: active ? 600 : 400 }}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
