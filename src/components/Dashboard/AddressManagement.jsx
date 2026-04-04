import React, { useState, useCallback } from 'react';
import { useAddresses } from '../../hooks/useAddresses';
import { MapView } from './MapView';
import { Icon } from '../Icons';
import { US_STATES } from '../../utils/constants';
import { submitForReview } from '../../services/addressService';

const EMPTY = { street:'', city:'', state:'KS', zip:'', zipPlus4:'', county:'', congressionalDistrict:'', lat:'', lon:'', residential:true, commercial:false, active:true };

const STATUS_CLS = { verified:'badge-blue', pending:'badge-amber', approved:'badge-green', rejected:'badge-red', draft:'badge-gray' };

export const AddressManagement = () => {
  const { addresses, total, page, setPage, pageSize, loading, add, update, del, reload } = useAddresses();
  const [form, setForm]       = useState(EMPTY);
  const [editing, setEditing] = useState(null); // id being edited
  const [mode, setMode]       = useState('view'); // view | add | edit
  const [search, setSearch]   = useState('');
  const [saved, setSaved]     = useState(false);

  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const selectRow = (addr) => {
    setForm({ ...EMPTY, ...addr, lat: String(addr.lat||''), lon: String(addr.lon||'') });
    setEditing(addr.id);
    setMode('edit');
  };

  const handleSave = async () => {
    if (mode === 'add') await add(form);
    else if (mode === 'edit' && editing) await update(editing, form);
    setSaved(true); setTimeout(()=>setSaved(false),1800);
    setMode('view'); setForm(EMPTY); setEditing(null);
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (window.confirm('Delete this address?')) { await del(editing); setMode('view'); setForm(EMPTY); setEditing(null); }
  };

  const handleSubmitSelected = async () => {
    if (!editing) return;
    await submitForReview([editing]);
    alert('Submitted for review.'); reload(page);
  };

  const filtered = addresses.filter(a =>
    !search || `${a.street} ${a.city} ${a.state} ${a.zip}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const inp = { className:'form-input', style:{fontSize:13} };
  const lbl = { className:'form-label' };

  return (
    <div>
      {/* Page header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,color:'var(--gray-900)',letterSpacing:'-.2px'}}>Address Management</h1>
          <p style={{fontSize:13,color:'var(--gray-500)',marginTop:2}}>View, add, edit and manage your address records</p>
        </div>
        <button className="btn btn-blue" onClick={()=>{setMode('add');setForm(EMPTY);setEditing(null);}}>
          <Icon name="plus" size={13}/> New Address
        </button>
      </div>

      {/* Stat row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:22}}>
        {[
          {label:'Total',      val:total,                                              cls:'blue' },
          {label:'Pending',    val:addresses.filter(a=>a.status==='pending').length,   cls:'amber'},
          {label:'Verified',   val:addresses.filter(a=>a.status==='verified').length,  cls:'green'},
          {label:'Issues',     val:addresses.filter(a=>a.status==='rejected').length,  cls:'red'  },
        ].map(s=>(
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <div style={{fontSize:26,fontWeight:700,color:'var(--gray-900)'}}>{s.val.toLocaleString()}</div>
            <div style={{fontSize:12,color:'var(--gray-500)',marginTop:3}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'400px 1fr',gap:20,marginBottom:20}}>
        {/* ── Form panel ── */}
        <div className="card" style={{padding:0,overflow:'hidden',alignSelf:'start'}}>
          <div className="card-header" style={{background:'var(--navy-mid)',borderBottom:'none',padding:'12px 18px'}}>
            <span style={{color:'#fff',fontWeight:700,fontSize:14}}>
              {mode==='add' ? 'New Address' : mode==='edit' ? 'Edit Address' : 'Address Details'}
            </span>
            {mode!=='view' && (
              <button className="btn btn-ghost btn-sm" style={{color:'#8baec9',borderColor:'transparent',padding:'3px 8px'}}
                onClick={()=>{setMode('view');setForm(EMPTY);setEditing(null);}}>
                <Icon name="x" size={12}/> Cancel
              </button>
            )}
          </div>
          <div style={{padding:'18px'}}>
            <div style={{marginBottom:12}}>
              <label {...lbl}>Street Address</label>
              <input {...inp} value={form.street||''} onChange={e=>set('street',e.target.value)} placeholder="e.g. 1201 W Meadow Creek Dr" disabled={mode==='view'} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 80px',gap:10,marginBottom:12}}>
              <div><label {...lbl}>City</label><input {...inp} value={form.city||''} onChange={e=>set('city',e.target.value)} placeholder="City" disabled={mode==='view'}/></div>
              <div><label {...lbl}>State</label>
                <select {...inp} className="form-input form-select" value={form.state||'KS'} onChange={e=>set('state',e.target.value)} disabled={mode==='view'}>
                  {US_STATES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div><label {...lbl}>ZIP Code</label><input {...inp} value={form.zip||''} onChange={e=>set('zip',e.target.value)} placeholder="00000" disabled={mode==='view'}/></div>
              <div><label {...lbl}>ZIP+4</label><input {...inp} value={form.zipPlus4||''} onChange={e=>set('zipPlus4',e.target.value)} placeholder="0000" disabled={mode==='view'}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div><label {...lbl}>Latitude</label><input {...inp} value={form.lat||''} onChange={e=>set('lat',e.target.value)} placeholder="0.0000" disabled={mode==='view'}/></div>
              <div><label {...lbl}>Longitude</label><input {...inp} value={form.lon||''} onChange={e=>set('lon',e.target.value)} placeholder="0.0000" disabled={mode==='view'}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div><label {...lbl}>County</label><input {...inp} value={form.county||''} onChange={e=>set('county',e.target.value)} placeholder="County" disabled={mode==='view'}/></div>
              <div><label {...lbl}>Cong. District</label><input {...inp} value={form.congressionalDistrict||''} onChange={e=>set('congressionalDistrict',e.target.value)} placeholder="KS-04" disabled={mode==='view'}/></div>
            </div>
            <div style={{display:'flex',gap:18,marginBottom:16}}>
              {['residential','commercial','active'].map(k=>(
                <label key={k} style={{display:'flex',alignItems:'center',gap:5,fontSize:13,cursor:mode==='view'?'default':'pointer',color:'var(--gray-700)'}}>
                  <input type="checkbox" checked={!!form[k]} onChange={e=>set(k,e.target.checked)} disabled={mode==='view'} />
                  {k.charAt(0).toUpperCase()+k.slice(1)}
                </label>
              ))}
            </div>
            {mode !== 'view' && (
              <div style={{display:'flex',gap:8}}>
                <button className={`btn btn-green flex-1`} onClick={handleSave} style={{fontSize:13}}>
                  <Icon name="save" size={13}/> {saved?'Saved!':'Save'}
                </button>
                {mode==='edit' && <>
                  <button className="btn btn-blue btn-sm" onClick={handleSubmitSelected} title="Submit for review">
                    <Icon name="send" size={13}/>
                  </button>
                  <button className="btn btn-red btn-sm" onClick={handleDelete} title="Delete">
                    <Icon name="trash" size={13}/>
                  </button>
                </>}
              </div>
            )}
          </div>
        </div>

        {/* ── Map ── */}
        <MapView
          lat={parseFloat(form.lat)||37.6922}
          lon={parseFloat(form.lon)||-97.3376}
          city={form.city||'Wichita'}
        />
      </div>

      {/* ── Address table ── */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div className="card-header">
          <span style={{fontWeight:700,fontSize:14,color:'var(--gray-900)'}}>Address List</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <div style={{position:'relative'}}>
              <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)'}}>
                <Icon name="search" size={13} color="var(--gray-400)"/>
              </span>
              <input className="form-input" style={{paddingLeft:28,width:200,fontSize:12}} placeholder="Search…"
                value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
            <span style={{fontSize:12,color:'var(--gray-400)'}}>{total.toLocaleString()} records</span>
          </div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table className="data-table">
            <thead><tr>
              <th>Address</th><th>City</th><th>State</th><th>ZIP</th>
              <th>Lat</th><th>Lon</th><th>Type</th><th>Status</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{textAlign:'center',padding:'28px',color:'var(--gray-400)'}}>Loading…</td></tr>}
              {!loading && filtered.map((addr,i)=>(
                <tr key={addr.id||i}
                  className={editing===addr.id?'row-selected':''}
                  onClick={()=>selectRow(addr)}>
                  <td style={{fontWeight:500}}>{addr.street}</td>
                  <td>{addr.city}</td><td>{addr.state}</td><td>{addr.zip}</td>
                  <td style={{fontFamily:'monospace',fontSize:12}}>{addr.lat}</td>
                  <td style={{fontFamily:'monospace',fontSize:12}}>{addr.lon}</td>
                  <td>
                    <span className={`badge ${addr.residential?'badge-navy':'badge-gray'}`}>
                      {addr.residential?'Residential':'Commercial'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLS[addr.status]||'badge-gray'}`}>
                      {addr.status||'draft'}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length===0 && (
                <tr><td colSpan={8} style={{textAlign:'center',padding:'28px',color:'var(--gray-400)'}}>No records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{padding:'10px 16px',display:'flex',justifyContent:'flex-end',gap:4,borderTop:'1px solid var(--gray-100)'}}>
          {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=>(
            <button key={p} onClick={()=>setPage(p)}
              className={`btn btn-sm ${p===page?'btn-navy':'btn-ghost'}`}
              style={{minWidth:32,padding:'4px 8px',fontSize:12}}>{p}</button>
          ))}
          {totalPages>5 && <span style={{padding:'0 4px',fontSize:12,color:'var(--gray-400)',alignSelf:'center'}}>…</span>}
          {page<totalPages && (
            <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p+1)} style={{fontSize:12}}>
              Next <Icon name="chevronR" size={11}/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
