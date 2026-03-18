import React, { useState } from 'react';
import Papa from 'papaparse';
import { Icon } from '../Icons';

export const FileUploadSection = ({ onFilesLoaded }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [files, setFiles]         = useState([]);

  const handle = (fileList) => {
    const arr = Array.from(fileList);
    arr.forEach(f => {
      const rows = [];
      Papa.parse(f, {
        header: true, skipEmptyLines: true,
        chunk: r => rows.push(...r.data),
        complete: () => {
          setFiles(prev => [...prev, { name: f.name, count: rows.length, ts: new Date().toLocaleTimeString() }]);
          onFilesLoaded?.(rows, f.name);
        },
      });
    });
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="section-heading">Upload Address Files</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-green" style={{ fontSize: 11 }}>
            <span className="status-dot green" style={{ width: 6, height: 6 }} />
            Auto-save enabled
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed(c => !c)}
            style={{ width: 28, height: 28, padding: 0, fontWeight: 700 }}>
            {collapsed ? '+' : '−'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
            Acceptable files include plat maps, addressing details with .xlsx, .csv, .txt
          </p>
          <div
            className={`drop-zone${dragging ? ' dragging' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
            onClick={() => document.getElementById('file-upload-input').click()}
          >
            <input id="file-upload-input" type="file" multiple accept=".csv,.xlsx,.xls,.txt"
              style={{ display: 'none' }} onChange={e => handle(e.target.files)} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: 8 }}>
              Address Workbook Upload
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 6 }}>Drag files</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>or click to browse — .xlsx, .csv, .txt</div>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--gray-700)' }}>
                  <Icon name="file" size={14} color="var(--blue)" />
                  <span style={{ fontWeight: 500 }}>{f.name}</span>
                  <span className="badge badge-green">{f.count.toLocaleString()} records</span>
                  <span style={{ color: 'var(--gray-400)', fontSize: 12, marginLeft: 'auto' }}>{f.ts}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
