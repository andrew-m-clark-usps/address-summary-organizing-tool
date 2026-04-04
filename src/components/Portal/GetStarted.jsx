import React from 'react';
import { Icon } from '../Icons';

const STEPS = [
  {
    n: 1, icon: 'edit',
    title: 'Input Address Information',
    desc: 'Use the Address Detail Entry to manually enter address records. Or use the File Upload Manager to upload acceptable files.',
  },
  {
    n: 2, icon: 'check',
    title: 'Validate Records',
    desc: 'Run format, schema, and range checks.',
  },
  {
    n: 3, icon: 'send',
    title: 'Submit for Review',
    desc: 'Route to reviewer for approval.',
  },
];

const ACCEPTED = [
  'Plat maps',
  'Address details: XLSX, CSV, TXT',
  'Supporting documentation: PDFs, JPG',
];

export const GetStarted = () => (
  <div style={{ marginBottom: 32 }}>
    {/* Dark banner */}
    <div style={{
      background: 'var(--navy-mid)', color: '#fff',
      padding: '10px 20px', borderRadius: '6px 6px 0 0',
      fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
    }}>
      Get Started
    </div>

    <div style={{
      border: '1px solid var(--gray-200)', borderTop: 'none',
      borderRadius: '0 0 6px 6px', background: '#fff',
      padding: '20px',
    }}>
      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {STEPS.map(step => (
          <div key={step.n} className="step-card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span className="step-number">{step.n}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 3 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--gray-500)' }}>
                {step.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Accepted inputs */}
      <div style={{
        background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
        borderRadius: 6, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--gray-500)', marginBottom: 10 }}>
          Accepted Inputs
        </div>
        <ul style={{ paddingLeft: 18, listStyleType: 'disc' }}>
          {ACCEPTED.map(item => (
            <li key={item} style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 4 }}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);
