import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Small delay for UX feedback
    await new Promise(r => setTimeout(r, 300));
    const result = login(username, password);
    setLoading(false);
    if (result.success) navigate('/dashboard');
    else setError(result.error || 'Invalid username or password.');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', flexDirection: 'column' }}>

      {/* Top branding bar */}
      <div style={{
        background: '#1B3A6B',
        padding: '0 32px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        flexShrink: 0,
      }}>
        {/* Eagle SVG */}
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <ellipse cx="18" cy="18" rx="18" ry="18" fill="#004B87"/>
          <text x="18" y="24" textAnchor="middle" fontSize="22" fill="white">🦅</text>
        </svg>
        <div>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 19, lineHeight: 1.1, letterSpacing: '-0.3px' }}>
            <span style={{ color: 'white' }}>USPS</span>
            <span style={{ fontWeight: 400, marginLeft: 6, color: '#b8cce0' }}>Address Management</span>
          </div>
          <div style={{ color: '#7faecf', fontSize: 12, marginTop: 1 }}>Admin Portal · Secure Access</div>
        </div>
      </div>

      {/* Centered login card */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{
          background: 'white',
          borderRadius: 10,
          boxShadow: '0 4px 28px rgba(0,0,0,0.13)',
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
        }}>
          {/* Card header stripe */}
          <div style={{ background: '#1B3A6B', padding: '22px 32px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>🔐</div>
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>Admin Sign In</div>
                <div style={{ color: '#a0c0de', fontSize: 12 }}>Enter your credentials to continue</div>
              </div>
            </div>
          </div>

          {/* Form body */}
          <div style={{ padding: '28px 32px 32px' }}>
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="login-username">Username</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 15, color: '#9ca3af', pointerEvents: 'none',
                  }}>👤</span>
                  <input
                    id="login-username"
                    className="form-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter username"
                    style={{ paddingLeft: 34 }}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label className="form-label" htmlFor="login-password">Password</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 15, color: '#9ca3af', pointerEvents: 'none',
                  }}>🔒</span>
                  <input
                    id="login-password"
                    className="form-input"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    style={{ paddingLeft: 34 }}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fca5a5',
                  color: '#991b1b', borderRadius: 6, padding: '10px 14px',
                  marginBottom: 18, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>⚠️</span> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', padding: '11px', fontSize: 15, borderRadius: 7 }}
              >
                {loading ? '⏳ Signing in…' : '🔑 Sign In'}
              </button>
            </form>

            {/* Demo credentials hint */}
            <div style={{
              marginTop: 20, padding: '11px 14px',
              background: '#f0f7ff', borderRadius: 6, border: '1px solid #bfdbfe',
              fontSize: 13, color: '#1e40af',
            }}>
              <strong>Demo:</strong>&nbsp; username: <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 3 }}>admin</code>
              &nbsp;·&nbsp; password: <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 3 }}>usps2024</code>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>
        United States Postal Service · Address Management System
      </div>
    </div>
  );
};
