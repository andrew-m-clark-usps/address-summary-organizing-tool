import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const Settings = () => {
  const { session } = useAuth();
  const [pageSize, setPageSize] = useState('50');
  const [theme, setTheme] = useState('light');
  const [saved, setSaved] = useState(false);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const Section = ({ title, children }) => (
    <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 24, marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 20px', color: '#1B3A6B', fontSize: 16, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>{title}</h3>
      {children}
    </div>
  );

  const Field = ({ label, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
      <label style={{ fontWeight: 500, color: '#333', fontSize: 14 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div>
      <h2 style={{ color: '#1B3A6B', marginBottom: 24 }}>Settings</h2>
      
      <Section title="Account Settings">
        <Field label="Username"><span style={{ color: '#555', fontSize: 14 }}>{session?.username || 'admin'}</span></Field>
        <Field label="Display Name"><input defaultValue={session?.name || 'John D.'} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} /></Field>
        <Field label="Role"><span style={{ background: '#e8f0fe', color: '#004B87', padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>Administrator</span></Field>
      </Section>
      
      <Section title="Display Preferences">
        <Field label="Records per page">
          <select value={pageSize} onChange={e=>setPageSize(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
            {['25','50','100','200'].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Theme">
          <select value={theme} onChange={e=>setTheme(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
      </Section>
      
      <Section title="Data Management">
        <Field label="Default Export Format">
          <select defaultValue="csv" style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
          </select>
        </Field>
        <Field label="Batch Processing Size">
          <select defaultValue="1000" style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
            {['500','1000','5000','10000'].map(n => <option key={n} value={n}>{n} records</option>)}
          </select>
        </Field>
      </Section>
      
      <Section title="System Configuration">
        <Field label="Match Confidence Threshold">
          <input type="range" min="50" max="100" defaultValue="70" style={{ width: 150 }} /> 
          <span style={{ marginLeft: 8, fontSize: 14, color: '#555' }}>70%</span>
        </Field>
        <Field label="IndexedDB Storage">
          <button style={{ background: '#fee', color: '#E31837', border: '1px solid #E31837', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>Clear Cache</button>
        </Field>
      </Section>
      
      <button onClick={handleSave} style={{ background: saved?'#28A745':'#004B87', color: 'white', border: 'none', borderRadius: 6, padding: '10px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 600, transition: 'background 0.3s' }}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
};
