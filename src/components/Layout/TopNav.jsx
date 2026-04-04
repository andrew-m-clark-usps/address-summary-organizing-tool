import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from '../Icons';
import { PORTAL_CONFIG } from '../../utils/constants';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Enterprise Services' },
  { path: '/addresses', label: 'Address Management'  },
  { path: '/review',    label: 'Internal Review Queue' },
];

const lastSync = new Date().toLocaleString('en-US', {
  month: '2-digit', day: '2-digit', year: 'numeric',
  hour:  '2-digit', minute: '2-digit', hour12: true,
});

export const TopNav = () => {
  const { session, logout } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <header style={{ background: '#0d1b2e', flexShrink: 0, position: 'sticky', top: 0, zIndex: 200 }}>
      {/* Primary nav row */}
      <div style={{
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,.07)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 32, borderRight: '1px solid rgba(255,255,255,.08)' }}>
          {/* USPS stamp logo */}
          <div style={{
            width: 34, height: 26, background: '#004b87',
            borderRadius: 2, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0,
            border: '1.5px solid rgba(255,255,255,.2)',
          }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 18, height: 2, background: '#fff', borderRadius: 1 }} />
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: '#7a9bc4', textTransform: 'uppercase' }}>USPS Enterprise</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 1, letterSpacing: '-.1px' }}>Municipal Portal</div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'stretch', gap: 2, flex: 1, paddingLeft: 16 }}>
          {NAV_ITEMS.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background:    'transparent',
                  border:        'none',
                  borderTop:     `3px solid ${active ? '#e31837' : 'transparent'}`,
                  borderBottom:  '3px solid transparent',
                  color:         active ? '#fff' : '#8baec9',
                  fontSize:      13,
                  fontWeight:    active ? 600 : 400,
                  padding:       '0 16px',
                  cursor:        'pointer',
                  transition:    'color 150ms, border-top-color 150ms',
                  whiteSpace:    'nowrap',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#c8ddef'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#8baec9'; }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Settings + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 16 }}>
          <button
            onClick={() => navigate('/settings')}
            style={{
              background: 'transparent', border: 'none', color: '#8baec9',
              padding: '8px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
            title="Settings"
          >
            <Icon name="settings" size={15} />
          </button>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent', border: 'none', color: '#8baec9',
              padding: '8px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12,
            }}
            title="Sign out"
          >
            <Icon name="logout" size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Secondary info row */}
      <div style={{
        padding: '5px 24px', display: 'flex', alignItems: 'center', gap: 24,
        background: 'rgba(0,0,0,.18)',
      }}>
        <span style={{ fontSize: 11, color: '#6b8aa8', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="user" size={11} color="#6b8aa8" />
          <strong style={{ color: '#8baec9' }}>User:</strong>
          &nbsp;{session?.email || PORTAL_CONFIG.userEmail}
        </span>
        <span style={{ fontSize: 11, color: '#6b8aa8', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="clock" size={11} color="#6b8aa8" />
          <strong style={{ color: '#8baec9' }}>Last Sync:</strong>
          &nbsp;{lastSync}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="status-dot green" />
          <span style={{ fontSize: 11, color: '#5a9e6f' }}>System Online</span>
        </div>
      </div>
    </header>
  );
};
