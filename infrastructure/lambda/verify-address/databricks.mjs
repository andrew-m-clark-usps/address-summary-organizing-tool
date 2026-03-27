/**
 * databricks.mjs — Databricks SQL Statement Execution API client
 *
 * Uses the Databricks SQL Statement Execution REST API (v2.0) — no
 * special JDBC/ODBC driver required; plain HTTPS from Lambda.
 *
 * Responsibilities:
 *   • INSERT verified address results into Delta table
 *   • SELECT for browse / export operations (admin panel)
 *   • Aggregate stats queries
 *   • Health check (ping via cheap catalog query)
 *
 * Authentication: Bearer token stored in AWS Secrets Manager
 * Warehouse: SQL Serverless (auto-scales to zero between requests)
 */

import { getSecret } from './secrets.mjs';
import { randomUUID } from 'crypto';

const API_VERSION  = '2.0';
const CATALOG      = process.env.DATABRICKS_CATALOG      || 'addresses';
const SCHEMA       = process.env.DATABRICKS_SCHEMA        || 'verified';
const TABLE        = `${CATALOG}.${SCHEMA}.results`;
const METRICS_TABLE= `${CATALOG}.analytics.daily_stats`;
const TRAINING_TBL = `${CATALOG}.ml.training_data`;

/** @type {{ host: string, token: string, warehouseId: string } | null} */
let dbConfig = null;

async function getConfig() {
    if (dbConfig) return dbConfig;
    const s = await getSecret(process.env.DATABRICKS_SECRET_ARN);
    dbConfig = {
        host:        s.host,
        token:       s.token,
        warehouseId: s.warehouse_id
    };
    return dbConfig;
}

/**
 * Execute a SQL statement via the Databricks Statement Execution API.
 * Uses synchronous mode (wait_timeout=30s) for interactive requests.
 *
 * @param {string}   sql
 * @param {object[]} [parameters]  - Named parameters: [{ name, value, type }]
 * @returns {Promise<{ columns: string[], rows: any[][] }>}
 */
async function execute(sql, parameters = []) {
    const cfg      = await getConfig();
    const endpoint = `https://${cfg.host}/api/${API_VERSION}/sql/statements`;

    const body = {
        warehouse_id:     cfg.warehouseId,
        statement:        sql,
        wait_timeout:     '30s',
        on_wait_timeout:  'CONTINUE',
        row_limit:        5000,
        ...(parameters.length ? { parameters } : {})
    };

    const resp = await fetch(endpoint, {
        method:  'POST',
        headers: {
            Authorization:  `Bearer ${cfg.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(`Databricks SQL error ${resp.status}: ${txt}`);
    }

    const data = await resp.json();

    // If still running, poll once
    if (data.status?.state === 'RUNNING' || data.status?.state === 'PENDING') {
        return pollStatement(cfg, data.statement_id);
    }

    if (data.status?.state === 'FAILED') {
        throw new Error(`Databricks statement failed: ${data.status.error?.message || 'unknown'}`);
    }

    return extractResult(data);
}

/**
 * Poll a long-running statement until it completes.
 */
async function pollStatement(cfg, statementId, maxAttempts = 10) {
    const url = `https://${cfg.host}/api/${API_VERSION}/sql/statements/${statementId}`;
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${cfg.token}` }
        });
        const data = await resp.json();
        if (data.status?.state === 'SUCCEEDED') return extractResult(data);
        if (data.status?.state === 'FAILED')    throw new Error(`Databricks: ${data.status.error?.message}`);
    }
    throw new Error('Databricks statement timed out.');
}

/**
 * Extract column names and row data from a Databricks statement result.
 */
function extractResult(data) {
    const cols = (data.manifest?.schema?.columns || []).map(c => c.name);
    const rows = (data.result?.data_array || []);
    return { columns: cols, rows };
}

/**
 * Convert raw columns+rows to array of plain objects.
 */
function toObjects({ columns, rows }) {
    return rows.map(row =>
        Object.fromEntries(columns.map((col, i) => [col, row[i]]))
    );
}

/* ─────────────────────────────────────────────────────────────
   Write Operations
────────────────────────────────────────────────────────────── */

/**
 * Persist a verification result to the Databricks Delta table.
 * Fire-and-forget (errors are logged but not re-thrown).
 *
 * @param {object} result  - Canonical verification result
 * @param {string} ip      - Requester IP
 */
export async function writeResult(result, ip) {
    const s   = result.standardized || {};
    const inp = result.input        || {};
    const id  = randomUUID();

    const sql = `
        INSERT INTO ${TABLE}
        (id, input_street, input_city, input_state, input_zip,
         std_street, std_city, std_state, std_zip, std_zip4,
         status, confidence, dpv_match_code, dpv_vacancy,
         carrier_route, delivery_point, from_cache, source,
         bedrock_attempted, verified_at, request_ip, response_ms)
        VALUES
        (:id, :input_street, :input_city, :input_state, :input_zip,
         :std_street, :std_city, :std_state, :std_zip, :std_zip4,
         :status, :confidence, :dpv_match_code, :dpv_vacancy,
         :carrier_route, :delivery_point, :from_cache, :source,
         false, current_timestamp(), :request_ip, :response_ms)
    `;

    const params = [
        { name: 'id',             value: id,                      type: 'STRING'  },
        { name: 'input_street',   value: inp.street  || '',       type: 'STRING'  },
        { name: 'input_city',     value: inp.city    || '',       type: 'STRING'  },
        { name: 'input_state',    value: inp.state   || '',       type: 'STRING'  },
        { name: 'input_zip',      value: inp.zip     || '',       type: 'STRING'  },
        { name: 'std_street',     value: s.street    || '',       type: 'STRING'  },
        { name: 'std_city',       value: s.city      || '',       type: 'STRING'  },
        { name: 'std_state',      value: s.state     || '',       type: 'STRING'  },
        { name: 'std_zip',        value: s.zip       || '',       type: 'STRING'  },
        { name: 'std_zip4',       value: s.zip4      || '',       type: 'STRING'  },
        { name: 'status',         value: result.status            || 'offline', type: 'STRING'  },
        { name: 'confidence',     value: String(result.confidence || 0),        type: 'INT'     },
        { name: 'dpv_match_code', value: result.dpvMatchCode      || 'N',       type: 'STRING'  },
        { name: 'dpv_vacancy',    value: result.dpvVacancy        || 'N',       type: 'STRING'  },
        { name: 'carrier_route',  value: result.carrierRoute      || '',        type: 'STRING'  },
        { name: 'delivery_point', value: result.deliveryPoint     || '',        type: 'STRING'  },
        { name: 'from_cache',     value: String(result.fromCache  || false),    type: 'BOOLEAN' },
        { name: 'source',         value: result.source            || 'offline', type: 'STRING'  },
        { name: 'request_ip',     value: ip || '',                              type: 'STRING'  },
        { name: 'response_ms',    value: String(result.responseTimeMs || 0),    type: 'INT'     }
    ];

    try {
        await execute(sql, params);
    } catch (err) {
        console.error('[Databricks] writeResult failed:', err.message);
    }
}

/* ─────────────────────────────────────────────────────────────
   Read Operations
────────────────────────────────────────────────────────────── */

/**
 * Browse / filter verified address records.
 *
 * @param {{ status?: string, state?: string, from?: string, to?: string,
 *           search?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<{ records: object[], total: number }>}
 */
export async function browseRecords(filters = {}) {
    const conditions = ['1=1'];
    const params     = [];

    if (filters.status) {
        conditions.push('status = :status');
        params.push({ name: 'status', value: filters.status, type: 'STRING' });
    }
    if (filters.state) {
        conditions.push('std_state = :state');
        params.push({ name: 'state', value: filters.state.toUpperCase(), type: 'STRING' });
    }
    if (filters.from) {
        conditions.push("verified_at >= :from_dt::TIMESTAMP");
        params.push({ name: 'from_dt', value: filters.from, type: 'STRING' });
    }
    if (filters.to) {
        conditions.push("verified_at <= :to_dt::TIMESTAMP");
        params.push({ name: 'to_dt', value: filters.to, type: 'STRING' });
    }
    if (filters.search) {
        conditions.push('(LOWER(std_street) LIKE :search OR LOWER(std_city) LIKE :search)');
        params.push({ name: 'search', value: `%${filters.search.toLowerCase()}%`, type: 'STRING' });
    }

    const where  = conditions.join(' AND ');
    const limit  = Math.min(filters.limit  || 100, 500);
    const offset = filters.offset || 0;

    const countSql = `SELECT COUNT(*) AS cnt FROM ${TABLE} WHERE ${where}`;
    const dataSql  = `
        SELECT id, input_street, input_city, input_state, input_zip,
               std_street, std_city, std_state, std_zip, std_zip4,
               status, confidence, dpv_match_code, from_cache, source,
               verified_at, response_ms
        FROM   ${TABLE}
        WHERE  ${where}
        ORDER BY verified_at DESC
        LIMIT  ${limit} OFFSET ${offset}
    `;

    const [countResult, dataResult] = await Promise.all([
        execute(countSql, params).then(r => toObjects(r)),
        execute(dataSql,  params).then(r => toObjects(r))
    ]);

    return {
        records: dataResult,
        total:   parseInt(countResult[0]?.cnt || '0', 10)
    };
}

/**
 * Aggregate statistics from Databricks.
 * Falls back to daily_stats table if available for speed.
 *
 * @returns {Promise<object>}
 */
export async function getStats() {
    const sql = `
        SELECT
            COUNT(*)                                                   AS total,
            SUM(CASE WHEN status = 'verified'  THEN 1 ELSE 0 END)    AS verified,
            SUM(CASE WHEN status = 'corrected' THEN 1 ELSE 0 END)    AS corrected,
            SUM(CASE WHEN status = 'invalid'   THEN 1 ELSE 0 END)    AS invalid,
            SUM(CASE WHEN from_cache = true    THEN 1 ELSE 0 END)    AS cache_hits,
            ROUND(AVG(response_ms), 0)                                AS avg_response_ms,
            SUM(CASE WHEN source = 'usps'      THEN 1 ELSE 0 END)    AS usps_calls,
            SUM(CASE WHEN source = 'bedrock'   THEN 1 ELSE 0 END)    AS bedrock_calls,
            SUM(CASE WHEN source LIKE 'sagemaker%' THEN 1 ELSE 0 END) AS sagemaker_calls
        FROM ${TABLE}
    `;

    try {
        const result = await execute(sql);
        const row    = toObjects(result)[0] || {};
        return {
            total:          parseInt(row.total          || 0, 10),
            verified:       parseInt(row.verified       || 0, 10),
            corrected:      parseInt(row.corrected      || 0, 10),
            invalid:        parseInt(row.invalid        || 0, 10),
            cacheHits:      parseInt(row.cache_hits     || 0, 10),
            avgResponseMs:  parseFloat(row.avg_response_ms || 0),
            uspsCalls:      parseInt(row.usps_calls     || 0, 10),
            bedrockCalls:   parseInt(row.bedrock_calls  || 0, 10),
            sagemakerCalls: parseInt(row.sagemaker_calls|| 0, 10)
        };
    } catch (err) {
        console.warn('[Databricks] getStats failed:', err.message);
        return {};
    }
}

/**
 * Health check — runs a trivial query.
 * @returns {Promise<{ status: string, latencyMs: number }>}
 */
export async function healthCheck() {
    const t0 = Date.now();
    try {
        await execute('SELECT 1 AS ping');
        return { status: 'up', latencyMs: Date.now() - t0 };
    } catch (err) {
        return { status: 'down', error: err.message };
    }
}
