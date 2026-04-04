import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './components/Auth/Login';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { Layout } from './components/Layout/Layout';
import { PortalHeader } from './components/Portal/PortalHeader';
import { GetStarted } from './components/Portal/GetStarted';
import { AddressEntryTable } from './components/Portal/AddressEntryTable';
import { FileUploadSection } from './components/Portal/FileUploadSection';
import { ReviewQueue } from './components/ReviewQueue/ReviewQueue';
import { AddressManagement } from './components/Dashboard/AddressManagement';
import { Settings } from './components/Settings/Settings';

/* ── Enterprise Services (Dashboard) ───────────────────────── */
const EnterprisePage = () => {
  const [dirty, setDirty] = React.useState(false);
  const handleSaveDraft  = () => alert('Draft saved.');
  const handleSubmit     = () => { alert('Package submitted for review.'); setDirty(false); };
  return (
    <div>
      <PortalHeader onSaveDraft={handleSaveDraft} onSubmit={handleSubmit} isDirty={dirty} />
      <GetStarted />
      <AddressEntryTable onRowsChange={() => setDirty(true)} />
      <FileUploadSection />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><EnterprisePage /></Layout></ProtectedRoute>} />
        <Route path="/addresses" element={<ProtectedRoute><Layout><AddressManagement /></Layout></ProtectedRoute>} />
        <Route path="/review"    element={<ProtectedRoute><Layout><ReviewQueue /></Layout></ProtectedRoute>} />
        <Route path="/settings"  element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
