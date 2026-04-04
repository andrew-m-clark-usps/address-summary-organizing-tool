import React from 'react';
import { Icon } from '../Icons';
import { PORTAL_CONFIG } from '../../utils/constants';

export const PortalHeader = ({ onSaveDraft, onSubmit, isDirty }) => (
  <div className="card" style={{ marginBottom: 24 }}>
    {/* Logo + Title row */}
    <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      {/* USPS stamp logo */}
      <div style={{
        width: 56, height: 44, background: '#004b87', borderRadius: 3,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 5, flexShrink: 0,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: '#e31837' }} />
        {[0,1,2].map(i => (
          <div key={i} style={{ marginLeft: 6, width: 28, height: 2.5, background: '#fff', borderRadius: 1 }} />
        ))}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 4 }}>
          USPS Enterprise
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', letterSpacing: '-.3px', lineHeight: 1.2, marginBottom: 6 }}>
          Municipal Portal
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
          Municipal portal for address assignment submissions, review, and approval.
        </p>
        {/* Tags */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-outline" style={{ fontSize: 12 }}>
            Region: {PORTAL_CONFIG.region}
          </span>
          <span className="badge badge-outline" style={{ fontSize: 12 }}>
            Authority: {PORTAL_CONFIG.authority}
          </span>
        </div>
      </div>

      {/* Action buttons — top-right */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, marginTop: 4 }}>
        <button className="btn btn-ghost" onClick={onSaveDraft} style={{ fontSize: 13 }}>
          <Icon name="save" size={14} />
          Save Draft
        </button>
        <button className="btn btn-blue" onClick={onSubmit} style={{ fontSize: 13 }}>
          <Icon name="send" size={14} />
          Submit Package
        </button>
      </div>
    </div>

    {/* Red-blue stripe */}
    <div className="stripe-divider">
      <div className="stripe-red" />
      <div className="stripe-blue" />
    </div>
  </div>
);
