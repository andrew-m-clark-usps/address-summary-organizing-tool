import React from 'react';

export const AddressList = ({ addresses, total, page, pageSize, onPageChange, loading }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  
  const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' };
  const tdStyle = { padding: '10px 14px', fontSize: 14, color: '#333', borderBottom: '1px solid #f0f0f0' };

  return (
    <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 24, marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#1B3A6B', fontSize: 16, fontWeight: 700 }}>Address List</h3>
        <span style={{ fontSize: 13, color: '#666' }}>{total?.toLocaleString()} records</span>
      </div>
      
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Address','City','State','ZIP','Latitude','Longitude'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(addresses||[]).map((addr, i) => (
                <tr key={addr.id||i} style={{ background: i%2===0?'white':'#fafafa' }}>
                  <td style={tdStyle}>{addr.street}</td>
                  <td style={tdStyle}>{addr.city}</td>
                  <td style={tdStyle}>{addr.state}</td>
                  <td style={tdStyle}>{addr.zip}</td>
                  <td style={tdStyle}>{addr.lat}</td>
                  <td style={tdStyle}>{addr.lon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 16 }}>
        {Array.from({length: Math.min(totalPages, 5)}, (_, i) => i+1).map(p => (
          <button key={p} onClick={() => onPageChange&&onPageChange(p)} style={{ padding: '6px 12px', border: '1px solid', borderColor: p===page?'#004B87':'#ddd', borderRadius: 4, background: p===page?'#004B87':'white', color: p===page?'white':'#333', cursor: 'pointer', fontSize: 13 }}>
            {p}
          </button>
        ))}
        {totalPages > 5 && <span style={{ color: '#666', padding: '0 4px' }}>...</span>}
        {page < totalPages && (
          <button onClick={() => onPageChange&&onPageChange(page+1)} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, background: 'white', color: '#333', cursor: 'pointer', fontSize: 13 }}>
            Next &gt;
          </button>
        )}
      </div>
    </div>
  );
};
