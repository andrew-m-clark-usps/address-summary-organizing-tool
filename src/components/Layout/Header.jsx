import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const Header = () => {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <header style={{ background: '#1B3A6B', color: 'white', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>🦅</span>
        <span style={{ fontWeight: 700, fontSize: 18 }}><strong>USPS</strong> Address Management</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 14 }}>Welcome, {session?.name || 'Admin'}</span>
        <button onClick={handleLogout} style={{ background: 'transparent', color: 'white', border: '1.5px solid rgba(255,255,255,0.6)', borderRadius: 20, padding: '5px 16px', cursor: 'pointer', fontSize: 13 }}>Logout</button>
      </div>
    </header>
  );
};
