import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './components/Auth/Login';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { Layout } from './components/Layout/Layout';
import { DashboardOverview } from './components/Dashboard/DashboardOverview';
import { AddressDetails } from './components/Dashboard/AddressDetails';
import { MapView } from './components/Dashboard/MapView';
import { AddressList } from './components/Dashboard/AddressList';
import { AnalysisDashboard } from './components/Dashboard/AnalysisDashboard';
import { UploadData } from './components/Upload/UploadData';
import { Settings } from './components/Settings/Settings';
import { useAddresses } from './hooks/useAddresses';
import { DASHBOARD_STATS } from './utils/constants';

const DashboardPage = () => {
  const { addresses, total, page, setPage, pageSize, loading, add, update, del } = useAddresses();
  const [selected, setSelected] = React.useState(null);
  const current = selected || (addresses[0] || {});

  return (
    <div>
      <DashboardOverview stats={{ ...DASHBOARD_STATS, totalAddresses: Math.max(DASHBOARD_STATS.totalAddresses, total) }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 0 }}>
        <AddressDetails selected={current} onSave={add} onDelete={del} />
        <MapView lat={parseFloat(current.lat)||39.7817} lon={parseFloat(current.lon)||-89.6501} city={current.city||'Springfield'} />
      </div>
      <AddressList addresses={addresses} total={total} page={page} pageSize={pageSize} onPageChange={setPage} loading={loading} />
    </div>
  );
};

const AddressesPage = () => {
  const { addresses, total, page, setPage, pageSize, loading, add, update, del } = useAddresses();
  const [selected, setSelected] = React.useState(null);
  const current = selected || (addresses[0] || {});

  return (
    <div>
      <h2 style={{ color: '#1B3A6B', marginBottom: 20 }}>My Addresses</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <AddressDetails selected={current} onSave={add} onDelete={del} />
        <MapView lat={parseFloat(current.lat)||39.7817} lon={parseFloat(current.lon)||-89.6501} city={current.city||'Springfield'} />
      </div>
      <AddressList addresses={addresses} total={total} page={page} pageSize={pageSize} onPageChange={setPage} loading={loading} />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
        <Route path="/addresses" element={<ProtectedRoute><Layout><AddressesPage /></Layout></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute><Layout><UploadData /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
