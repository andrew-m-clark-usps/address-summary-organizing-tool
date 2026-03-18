import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { useAnalysis } from '../../hooks/useAnalysis';
import { AnalysisDashboard } from '../Dashboard/AnalysisDashboard';

const UploadZone = ({ label, color, onLoad, data, name }) => {
  const [dragging, setDragging] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    const records = [];
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      chunk: (results) => { records.push(...results.data); },
      complete: () => onLoad(records, file.name),
    });
  };

  return (
    <div
      onDragOver={e=>{e.preventDefault();setDragging(true)}}
      onDragLeave={()=>setDragging(false)}
      onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0])}}
      style={{ border: `2px dashed ${dragging?color:'#ddd'}`, borderRadius: 8, padding: 32, textAlign: 'center', background: dragging?'#f0f8ff':'white', cursor: 'pointer', transition: 'all 0.2s' }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
      <div style={{ fontWeight: 600, color, marginBottom: 8 }}>{label}</div>
      {data ? (
        <div style={{ color: '#28A745' }}>✅ {name} — {data.length.toLocaleString()} records</div>
      ) : (
        <>
          <p style={{ color: '#888', fontSize: 14, margin: '0 0 16px' }}>Drop CSV here or click to browse</p>
          <label style={{ background: color, color: 'white', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
            Choose File
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e=>handleFile(e.target.files[0])} />
          </label>
        </>
      )}
    </div>
  );
};

export const UploadData = () => {
  const [dataA, setDataA] = useState(null);
  const [nameA, setNameA] = useState('');
  const [dataB, setDataB] = useState(null);
  const [nameB, setNameB] = useState('');
  const { results, progress, running, error, analyze } = useAnalysis();

  const handleRun = () => {
    if (dataA && dataB) analyze(dataA, dataB);
  };

  return (
    <div>
      <h2 style={{ color: '#1B3A6B', marginBottom: 20 }}>Upload Data</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <UploadZone label="System A" color="#004B87" onLoad={(d,n)=>{setDataA(d);setNameA(n)}} data={dataA} name={nameA} />
        <UploadZone label="System B" color="#E31837" onLoad={(d,n)=>{setDataB(d);setNameB(n)}} data={dataB} name={nameB} />
      </div>
      
      {running && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: '#e5e7eb', borderRadius: 4, overflow: 'hidden', height: 8 }}>
            <div style={{ background: '#004B87', height: '100%', width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, color: '#666', fontSize: 14 }}>Processing: {Math.round(progress)}%</div>
        </div>
      )}
      
      {error && <div style={{ background: '#fee', color: '#E31837', padding: 12, borderRadius: 6, marginBottom: 16 }}>{error}</div>}
      
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          disabled={!dataA || !dataB || running}
          onClick={handleRun}
          style={{ background: dataA&&dataB?'#004B87':'#ccc', color: 'white', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: dataA&&dataB?'pointer':'not-allowed', fontSize: 15, fontWeight: 600 }}
        >
          {running ? '⏳ Running Analysis...' : '🔍 Run Analysis'}
        </button>
        {(dataA||dataB) && <button onClick={()=>{setDataA(null);setDataB(null)}} style={{ background: '#f5f5f5', color: '#666', border: '1px solid #ddd', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Clear</button>}
      </div>
      
      {results && <AnalysisDashboard results={results} />}
    </div>
  );
};
