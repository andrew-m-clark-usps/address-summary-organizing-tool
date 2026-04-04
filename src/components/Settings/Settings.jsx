import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from '../Icons';
import { clearAddresses } from '../../services/addressService';
import { PORTAL_CONFIG } from '../../utils/constants';

const Section = ({ title, icon, children }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <div className="card-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={15} color="var(--navy-mid)" />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>{title}</span>
      </div>
    </div>
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>{children}</div>
  </div>
);

const Row = ({ label, hint, children }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 0', borderBottom: '1px solid var(--gray-100)',
  }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)' }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

export const Settings = () => {
  const { session } = useAuth();
  const [pageSize, setPageSize]     = useState('50');
  const [threshold, setThreshold]   = useState(70);
  const [batchSize, setBatchSize]   = useState('1000');
  const [exportFmt, setExportFmt]   = useState('csv');
  const [saved, setSaved]           = useState(false);
  const [cleared, setCleared]       = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all your stored address records? This cannot be undone.')) return;
    await clearAddresses();
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  const sel = (val, onChange, options) => (
    <select
      className="form-input form-select"
      value={val}
      onChange={e => onChange(e.target.value)}
      style={{ width: 140, fontSize: 13 }}
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 3 }}>
          Configure your portal preferences and account options.
        </p>
      </div>

      <Section title="Account" icon="user">
        <Row label="Username">
          <span style={{ fontSize: 13, color: 'var(--gray-500)', fontFamily: 'monospace' }}>
            {session?.username || 'admin'}
          </span>
        </Row>
        <Row label="Display Name">
          <input
            className="form-input"
            defaultValue={session?.name || 'John D.'}
            style={{ width: 180, fontSize: 13 }}
          />
        </Row>
        <Row label="Email" hint="Used in the portal nav bar">
          <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
            {session?.email || PORTAL_CONFIG.userEmail}
          </span>
        </Row>
        <Row label="Role">
          <span className="badge badge-navy" style={{ fontSize: 12 }}>Administrator</span>
        </Row>
        <Row label="Region">
          <span className="badge badge-outline" style={{ fontSize: 12 }}>{PORTAL_CONFIG.region}</span>
        </Row>
      </Section>

      <Section title="Display Preferences" icon="eye">
        <Row label="Records per page" hint="Applied to address tables">
          {sel(pageSize, setPageSize, [
            {v:'25',l:'25'},{v:'50',l:'50'},{v:'100',l:'100'},{v:'200',l:'200'},
          ])}
        </Row>
        <Row label="Default export format">
          {sel(exportFmt, setExportFmt, [
            {v:'csv',l:'CSV'},{v:'xlsx',l:'Excel (XLSX)'},
          ])}
        </Row>
      </Section>

      <Section title="Data & Processing" icon="settings">
        <Row label="Batch processing size" hint="Records per chunk for large file imports">
          {sel(batchSize, setBatchSize, [
            {v:'500',l:'500 records'},{v:'1000',l:'1,000 records'},
            {v:'5000',l:'5,000 records'},{v:'10000',l:'10,000 records'},
          ])}
        </Row>
        <Row label="Match confidence threshold" hint={`Current: ${threshold}%`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range" min={50} max={100} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              style={{ width: 120 }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-mid)', width: 36 }}>
              {threshold}%
            </span>
          </div>
        </Row>
      </Section>

      <Section title="Storage" icon="inbox">
        <Row label="Address records" hint="Stored in your browser's IndexedDB — only you can see your records">
          <button
            className="btn btn-sm btn-red"
            onClick={handleClear}
            style={{ fontSize: 12 }}
          >
            <Icon name="trash" size={12} />
            {cleared ? 'Cleared' : 'Clear My Data'}
          </button>
        </Row>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-blue" onClick={handleSave} style={{ fontSize: 13, minWidth: 120 }}>
          <Icon name="save" size={14} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};
