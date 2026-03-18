import React, { useState, useEffect } from 'react';
import { getAllAddresses, updateStatus } from '../../services/addressService';
import { Icon } from '../Icons';

const STATUS_META = {
  pending:  { label: 'Pending',  cls: 'badge-amber' },
  approved: { label: 'Approved', cls: 'badge-green' },
  rejected: { label: 'Rejected', cls: 'badge-red'   },
  verified: { label: 'Verified', cls: 'badge-blue'  },
  draft:    { label: 'Draft',    cls: 'badge-gray'  },
};

export const ReviewQueue = () => {
  const [rows, setRows]     = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async () => setRows(await getAllAddresses());
  useEffect(() => { load(); }, []);

  const act = async (id, status) => { await updateStatus(id, status); load(); };

  const visible = rows.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search && !`${r.street} ${r.city} ${r.state}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>Internal Review Queue</h1>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>Review and action submitted address records</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <Icon name="refresh" size={13} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={13} color="var(--gray-400)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="form-input" placeholder="Search address…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 30, width: 220, fontSize: 13 }} />
        </div>
        {['all','pending','approved','rejected','draft'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`btn btn-sm ${filter === s ? 'btn-navy' : 'btn-ghost'}`}
            style={{ textTransform: 'capitalize' }}>{s}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>{visible.length} record{visible.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Address</th><th>City</th><th>State</th><th>ZIP</th>
                <th>District</th><th>Submitted</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const meta = STATUS_META[row.status] || STATUS_META.draft;
                return (
                  <tr key={row.id} style={{ cursor: 'default' }}>
                    <td style={{ fontWeight: 500 }}>{row.street}</td>
                    <td>{row.city}</td><td>{row.state}</td><td>{row.zip}</td>
                    <td>{row.congressionalDistrict || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
                    </td>
                    <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {row.status === 'pending' && <>
                          <button className="btn btn-sm btn-green" onClick={() => act(row.id, 'approved')}>
                            <Icon name="check" size={11} /> Approve
                          </button>
                          <button className="btn btn-sm btn-red" onClick={() => act(row.id, 'rejected')}>
                            <Icon name="x" size={11} /> Reject
                          </button>
                        </>}
                        {row.status !== 'pending' && (
                          <button className="btn btn-sm btn-ghost" onClick={() => act(row.id, 'pending')}>
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)' }}>No records match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
