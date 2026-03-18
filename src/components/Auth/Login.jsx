import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = login(username, password);
    if (result.success) navigate('/dashboard');
    else setError(result.error);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5' }}>
      <div style={{ background: '#1B3A6B', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>🦅</span>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 20 }}>USPS Address Management</div>
          <div style={{ color: '#a0b4d0', fontSize: 13 }}>Admin Portal</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)' }}>
        <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '40px 48px', width: '100%', maxWidth: 420 }}>
          <h2 style={{ color: '#1B3A6B', marginBottom: 8, textAlign: 'center' }}>Admin Sign In</h2>
          <p style={{ color: '#666', textAlign: 'center', marginBottom: 28, fontSize: 14 }}>Sign in to access the USPS Address Management Portal</p>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#333', fontWeight: 600, fontSize: 14 }}>Username</label>
              <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter username" style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }} required />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#333', fontWeight: 600, fontSize: 14 }}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }} required />
            </div>
            {error && <div style={{ background: '#fee', border: '1px solid #E31837', color: '#E31837', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>{error}</div>}
            <button type="submit" style={{ width: '100%', background: '#004B87', color: 'white', border: 'none', borderRadius: 6, padding: '12px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>Sign In</button>
          </form>
          <div style={{ marginTop: 24, padding: '12px 16px', background: '#f0f8ff', borderRadius: 6, fontSize: 13, color: '#555' }}>
            <strong>Demo credentials:</strong> admin / usps2024
          </div>
        </div>
      </div>
    </div>
  );
};
