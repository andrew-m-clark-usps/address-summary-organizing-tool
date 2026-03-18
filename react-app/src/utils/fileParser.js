import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const STREET_FIELDS = ['address', 'street', 'street address', 'address line 1', 'addr', 'street_address', 'streetaddress'];
const CITY_FIELDS   = ['city', 'town', 'municipality'];
const STATE_FIELDS  = ['state', 'st', 'province', 'state_code', 'statecode'];
const ZIP_FIELDS    = ['zip', 'zip code', 'postal code', 'postalcode', 'zipcode', 'postal', 'zip_code'];

function detectField(headers, candidates) {
    const lower = headers.map(h => h.toLowerCase().trim());
    for (const cand of candidates) {
        const idx = lower.indexOf(cand.toLowerCase());
        if (idx >= 0) return headers[idx];
    }
    return null;
}

function normalizeRecord(row, headers) {
    const streetField = detectField(headers, STREET_FIELDS);
    const cityField   = detectField(headers, CITY_FIELDS);
    const stateField  = detectField(headers, STATE_FIELDS);
    const zipField    = detectField(headers, ZIP_FIELDS);
    return {
        street: streetField ? (row[streetField] || '') : '',
        city:   cityField   ? (row[cityField]   || '') : '',
        state:  stateField  ? (row[stateField]  || '') : '',
        zip:    zipField    ? String(row[zipField] || '') : '',
        _raw: row
    };
}

export function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (!results.data || results.data.length === 0) {
                    reject(new Error('No data found in CSV file.'));
                    return;
                }
                const headers = results.meta.fields || [];
                const records = results.data.map(row => normalizeRecord(row, headers));
                resolve({ records, headers, raw: results.data });
            },
            error: (err) => reject(new Error('CSV parse error: ' + err.message))
        });
    });
}

export function parseExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                const sheetName = wb.SheetNames[0];
                const sheet = wb.Sheets[sheetName];
                const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (!raw || raw.length === 0) {
                    reject(new Error('No data found in Excel file.'));
                    return;
                }
                const headers = raw.length > 0 ? Object.keys(raw[0]) : [];
                const records = raw.map(row => normalizeRecord(row, headers));
                resolve({ records, headers, raw });
            } catch (err) {
                reject(new Error('Excel parse error: ' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('File read error.'));
        reader.readAsBinaryString(file);
    });
}

export function loadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') return parseCSV(file);
    if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
    return Promise.reject(new Error('Unsupported file format. Use CSV or Excel (.xlsx/.xls).'));
}
