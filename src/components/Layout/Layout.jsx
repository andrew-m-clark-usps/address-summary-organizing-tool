import React from 'react';
import { TopNav } from './TopNav';

export const Layout = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <TopNav />
    <main style={{ flex: 1, padding: '28px 32px', background: 'var(--gray-100)', overflowY: 'auto' }}>
      {children}
    </main>
  </div>
);
