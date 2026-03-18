import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { loadFile } from '../utils/fileParser';

export default function FileUploadZone({ system }) {
    const { state, dispatch } = useApp();
    const inputRef = useRef(null);
    const data = system === 'a' ? state.dataA : state.dataB;
    const isLoaded = !!data;

    async function handleFile(file) {
        if (!file) return;
        dispatch({ type: 'SET_LOADING', payload: { loading: true, text: `Loading System ${system.toUpperCase()} file…`, sub: file.name } });
        try {
            const result = await loadFile(file);
            dispatch({ type: system === 'a' ? 'SET_DATA_A' : 'SET_DATA_B', payload: result });
            dispatch({ type: 'SET_LOADING', payload: { loading: false } });
        } catch (err) {
            dispatch({ type: 'SET_LOADING', payload: { loading: false } });
            alert('Error loading file: ' + err.message);
        }
    }

    function handleInputChange(e) {
        const file = e.target.files[0];
        if (file) handleFile(file);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    return (
        <div
            className={`upload-zone ${isLoaded ? 'loaded' : ''}`}
            id={`upload-zone-${system}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={handleInputChange}
            />
            {isLoaded ? (
                <div className="upload-loaded">
                    <span className="upload-icon">✅</span>
                    <div className="upload-loaded-text">
                        <strong>{data.records.length.toLocaleString()} records loaded</strong>
                        <div className="upload-loaded-sub">Click to replace file</div>
                    </div>
                </div>
            ) : (
                <div className="upload-prompt">
                    <span className="upload-icon">📁</span>
                    <div className="upload-prompt-text">
                        <strong>Drop file here or click to browse</strong>
                        <div className="upload-prompt-sub">Supports CSV, XLSX, XLS</div>
                    </div>
                </div>
            )}
        </div>
    );
}
