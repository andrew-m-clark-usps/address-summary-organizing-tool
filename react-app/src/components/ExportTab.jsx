import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportMatchedCsv, exportUnmatchedACsv, exportUnmatchedBCsv, exportSummaryCsv } from '../utils/csvExport';
import { exportPowerPoint } from '../utils/pptxExport';
import AlertMessage from './AlertMessage';

export default function ExportTab() {
    const { state, chartRefsRef } = useApp();
    const { analysis, matchResults } = state;
    const [alert, setAlert] = useState(null);

    async function handleExportPptx() {
        if (!analysis) {
            setAlert({ type: 'warning', message: 'Please run analysis before exporting.' });
            return;
        }
        setAlert(null);
        try {
            await exportPowerPoint({ analysis, matchResults, chartRefs: chartRefsRef?.current || {} });
            setAlert({ type: 'success', message: 'PowerPoint presentation downloaded: Address_Analysis_Report.pptx' });
        } catch (err) {
            setAlert({ type: 'danger', message: 'PowerPoint export failed: ' + err.message });
        }
    }

    function handleExport(fn, label) {
        try {
            fn();
            setAlert({ type: 'success', message: `${label} exported successfully.` });
        } catch (err) {
            setAlert({ type: 'danger', message: 'Export failed: ' + err.message });
        }
    }

    return (
        <div className="tab-content active" id="tab-export">
            <h2 className="tab-title">📥 Export</h2>

            {alert && <AlertMessage type={alert.type} message={alert.message} />}

            {/* Featured PowerPoint Export */}
            <div className="export-featured-card">
                <div className="export-featured-icon">📊</div>
                <div className="export-featured-content">
                    <h3>Export PowerPoint Presentation</h3>
                    <p>Generate a comprehensive 13-slide analysis report with charts, statistics, and insights.</p>
                </div>
                <button
                    className="btn btn-primary btn-lg"
                    onClick={handleExportPptx}
                    disabled={!analysis}
                >
                    ⬇ Download PPTX
                </button>
            </div>

            {/* CSV Exports */}
            <div className="export-grid">
                <div className="export-card">
                    <div className="export-card-icon">📄</div>
                    <h4>Matched Records</h4>
                    <p>All matched record pairs with confidence scores and discrepancies.</p>
                    <button
                        className="btn btn-secondary"
                        onClick={() => handleExport(() => exportMatchedCsv(matchResults), 'Matched Records CSV')}
                        disabled={!matchResults}
                    >
                        ⬇ Export CSV
                    </button>
                </div>

                <div className="export-card">
                    <div className="export-card-icon">📄</div>
                    <h4>Unmatched — System A</h4>
                    <p>Records from System A that could not be matched to System B.</p>
                    <button
                        className="btn btn-secondary"
                        onClick={() => handleExport(() => exportUnmatchedACsv(matchResults), 'Unmatched A CSV')}
                        disabled={!matchResults}
                    >
                        ⬇ Export CSV
                    </button>
                </div>

                <div className="export-card">
                    <div className="export-card-icon">📄</div>
                    <h4>Unmatched — System B</h4>
                    <p>Records from System B that could not be matched to System A.</p>
                    <button
                        className="btn btn-secondary"
                        onClick={() => handleExport(() => exportUnmatchedBCsv(matchResults), 'Unmatched B CSV')}
                        disabled={!matchResults}
                    >
                        ⬇ Export CSV
                    </button>
                </div>

                <div className="export-card">
                    <div className="export-card-icon">📊</div>
                    <h4>Analysis Summary</h4>
                    <p>Full statistical summary including quality metrics and AI metrics.</p>
                    <button
                        className="btn btn-secondary"
                        onClick={() => handleExport(() => exportSummaryCsv(analysis), 'Summary CSV')}
                        disabled={!analysis}
                    >
                        ⬇ Export CSV
                    </button>
                </div>
            </div>
        </div>
    );
}
