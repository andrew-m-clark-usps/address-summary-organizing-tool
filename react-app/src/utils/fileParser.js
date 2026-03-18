import Papa from 'papaparse';
import ExcelJS from 'exceljs';

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
        reader.onload = async (e) => {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(e.target.result);

                const worksheet = workbook.worksheets[0];
                if (!worksheet) {
                    reject(new Error('No worksheet found in Excel file.'));
                    return;
                }

                // Read headers from the first non-empty row
                const headers = [];
                const headerRow = worksheet.getRow(1);
                headerRow.eachCell({ includeEmpty: false }, (cell) => {
                    headers.push(String(cell.value !== null && cell.value !== undefined ? cell.value : ''));
                });

                if (headers.length === 0) {
                    reject(new Error('No data found in Excel file.'));
                    return;
                }

                // Read data rows
                const raw = [];
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    if (rowNumber === 1) return; // skip header
                    const rowObj = {};
                    headers.forEach((header, i) => {
                        const cell = row.getCell(i + 1);
                        const val = cell.value;
                        rowObj[header] = val !== null && val !== undefined ? String(val) : '';
                    });
                    raw.push(rowObj);
                });

                if (raw.length === 0) {
                    reject(new Error('No data found in Excel file.'));
                    return;
                }

                const records = raw.map(row => normalizeRecord(row, headers));
                resolve({ records, headers, raw });
            } catch (err) {
                reject(new Error('Excel parse error: ' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('File read error.'));
        reader.readAsArrayBuffer(file);
    });
}

export function loadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') return parseCSV(file);
    if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
    return Promise.reject(new Error('Unsupported file format. Use CSV or Excel (.xlsx/.xls).'));
}
