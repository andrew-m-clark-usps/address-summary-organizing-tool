import React, { useState } from 'react';
import { US_STATES } from '../../utils/constants';

const inputStyle = { width: '100%', padding: '8px 12px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#444' };

export const AddressDetails = ({ selected, onSave, onDelete }) => {
  const [form, setForm] = useState(selected || {
    street: '1234 Elm Street', city: 'Springfield', state: 'IL', zip: '62701',
    lat: '39.7817', lon: '-89.6501', residential: true, commercial: false, active: true
  });

  React.useEffect(() => { if (selected) setForm(selected); }, [selected]);

  const set = (k, v) => setForm(p => ({...p, [k]: v}));

  return (
    <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 24 }}>
      <h3 style={{ margin: '0 0 20px', color: '#1B3A6B', fontSize: 16, fontWeight: 700 }}>Address Details</h3>
      
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Street Address</label>
        <input value={form.street||''} onChange={e=>set('street',e.target.value)} placeholder="1234 Elm Street" style={inputStyle} />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>City</label>
          <input value={form.city||''} onChange={e=>set('city',e.target.value)} placeholder="Springfield" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <select value={form.state||'IL'} onChange={e=>set('state',e.target.value)} style={inputStyle}>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>ZIP Code</label>
          <input value={form.zip||''} onChange={e=>set('zip',e.target.value)} placeholder="62701" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Latitude</label>
          <input value={form.lat||''} onChange={e=>set('lat',e.target.value)} placeholder="39.7817" style={inputStyle} />
        </div>
      </div>
      
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Longitude</label>
        <input value={form.lon||''} onChange={e=>set('lon',e.target.value)} placeholder="-89.6501" style={inputStyle} />
      </div>
      
      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        {['residential','commercial','active'].map(k => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form[k]} onChange={e=>set(k,e.target.checked)} />
            {k.charAt(0).toUpperCase()+k.slice(1)}
          </label>
        ))}
      </div>
      
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ flex:1, background:'#004B87', color:'white', border:'none', borderRadius:6, padding:'9px', cursor:'pointer', fontSize:13, fontWeight:600 }}>⬆ Upload</button>
        <button style={{ flex:1, background:'#FF6B35', color:'white', border:'none', borderRadius:6, padding:'9px', cursor:'pointer', fontSize:13, fontWeight:600 }}>✏ Edit</button>
        <button onClick={()=>onSave&&onSave(form)} style={{ flex:1, background:'#28A745', color:'white', border:'none', borderRadius:6, padding:'9px', cursor:'pointer', fontSize:13, fontWeight:600 }}>💾 Save</button>
        <button onClick={()=>onDelete&&onDelete(form.id)} style={{ flex:1, background:'#E31837', color:'white', border:'none', borderRadius:6, padding:'9px', cursor:'pointer', fontSize:13, fontWeight:600 }}>🗑 Delete</button>
      </div>
    </div>
  );
};
