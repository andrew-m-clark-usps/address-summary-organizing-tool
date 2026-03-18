import React, { useState } from 'react';
import { Icon } from '../Icons';
import { US_STATES, SAMPLE_ADDRESSES } from '../../utils/constants';

const EMPTY_ROW = () => ({
  id: Date.now() + Math.random(),
  street: '', city: '', state: 'KS', zip: '',
  congressionalDistrict: 'KS-04', countyCode: 'KS-173',
  isNew: true,
});

const COLS = [
  { key: 'street',                label: 'Address',                 width: 220, type: 'text',   placeholder: 'e.g. 1201 W Meadow Creek Dr' },
  { key: 'city',                  label: 'City',                    width: 140, type: 'text',   placeholder: 'City' },
  { key: 'state',                 label: 'State',                   width: 72,  type: 'select'  },
  { key: 'zip',                   label: 'Zip Code',                width: 90,  type: 'text',   placeholder: '00000' },
  { key: 'congressionalDistrict', label: 'Congressional District',  width: 160, type: 'text',   placeholder: 'e.g. KS-04' },
  { key: 'countyCode',            label: 'County Code',             width: 120, type: 'text',   placeholder: 'e.g. KS-173' },
];

export const AddressEntryTable = ({ onRowsChange }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [rows, setRows] = useState(
    SAMPLE_ADDRESSES.slice(0, 3).map(a => ({ ...a }))
  );
  const [selectedId, setSelectedId] = useState(null);

  const setCell = (id, key, value) => {
    const next = rows.map(r => r.id === id ? { ...r, [key]: value } : r);
    setRows(next);
    onRowsChange?.(next);
  };

  const addRow = () => {
    const r   = EMPTY_ROW();
    const next = [...rows, r];
    setRows(next);
    onRowsChange?.(next);
    setSelectedId(r.id);
  };

  const deleteRow = (id) => {
    const next = rows.filter(r => r.id !== id);
    setRows(next);
    onRowsChange?.(next);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="section-heading">Address Detail Entry</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-outline-blue btn-sm" style={{ borderRadius: 20 }}>
            <Icon name="edit" size={12} />
            Manual entry
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCollapsed(c => !c)}
            style={{ width: 28, height: 28, padding: 0, borderRadius: 4, fontWeight: 700 }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '−'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Sub-header */}
          <div style={{
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--gray-200)',
            background: 'var(--gray-50)',
          }}>
            <span className="text-label" style={{ color: 'var(--gray-500)' }}>
              Enter one address per row.
            </span>
            <button className="btn btn-ghost btn-sm" onClick={addRow} style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}>
              <Icon name="plus" size={13} color="var(--blue)" />
              Add Row
            </button>
          </div>

          {/* Scrollable table wrapper */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  {COLS.map(c => (
                    <th key={c.key} style={{ width: c.width, minWidth: c.width }}>{c.label}</th>
                  ))}
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    className={selectedId === row.id ? 'row-selected' : ''}
                    onClick={() => setSelectedId(row.id)}
                    style={{ cursor: 'default' }}
                  >
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: '6px 8px' }}>
                        {col.type === 'select' ? (
                          <select
                            className="inline-input form-select"
                            value={row[col.key] || ''}
                            onChange={e => setCell(row.id, col.key, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%' }}
                          >
                            {US_STATES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input
                            className="inline-input"
                            type="text"
                            value={row[col.key] || ''}
                            placeholder={col.placeholder}
                            onChange={e => setCell(row.id, col.key, e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                      </td>
                    ))}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); deleteRow(row.id); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--gray-400)',
                          cursor: 'pointer', padding: 4, borderRadius: 4,
                          display: 'inline-flex', alignItems: 'center',
                          transition: 'color 150ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--gray-400)'}
                        title="Delete row"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length + 1} style={{ textAlign: 'center', padding: '28px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      No address rows yet — click Add Row to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Row count footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
            {rows.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                Click a row to select · Click a cell to edit
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
