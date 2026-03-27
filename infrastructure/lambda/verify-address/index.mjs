/**
 * index.mjs — Address Verification Lambda Handler
 *
 * Routes:
 *   POST /verify   — Real-time address verification
 *   POST /parse    — Bedrock NLP freeform address parsing
 *   GET  /health   — Service health (all backends)
 *   GET  /audit    — Audit log query (OpenSearch)
 *   GET  /search   — Full-text address search (OpenSearch)
 *   GET  /stats    — Aggregated stats (Databricks)
 *   GET  /browse   — Browse / filter Databricks records
 *   POST /batch    — Trigger SageMaker Batch Transform (stub)
 *
 * Pipeline (POST /verify):
 *   1. Rate-limit check (Redis)
 *   2. Normalize input
 *   3. Cache lookup (Redis)
 *   4. USPS API validation
 *      ↳ On failure: SageMaker NER → Bedrock Claude (fallback chain)
 *   5. ML confidence scoring (SageMaker)
 *   6. Generate Titan embedding (Bedrock)
 *   7. Cache result (Redis, TTL 24h)
 *   8. Index in OpenSearch (audit + k-NN)
 *   9. Persist in Databricks Delta table
 */

import * as Cache       from './cache.mjs';
import * as Search      from './search.mjs';
import * as Databricks  from './databricks.mjs';
import * as Bedrock     from './bedrock.mjs';
import * as SageMaker   from './sagemaker.mjs';
import { verifyAddress as uspsVerify } from './usps.mjs';

// Ensure OpenSearch index exists on cold start (idempotent)
Search.ensureIndex().catch(err => console.warn('[Init] OpenSearch ensureIndex:', err.message));

/* ─────────────────────────────────────────────────────────────
   Handler entry point
────────────────────────────────────────────────────────────── */

export const handler = async (event) => {
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
    const path   = (event.path || event.rawPath || '/').replace(/\/{2,}/g, '/');
    const ip     = event.requestContext?.identity?.sourceIp
                || event.requestContext?.http?.sourceIp
                || '0.0.0.0';

    // CORS preflight
    if (method === 'OPTIONS') return cors(204);

    try {
        // Route dispatch
        if (method === 'POST' && path.endsWith('/verify'))  return await handleVerify(event, ip);
        if (method === 'POST' && path.endsWith('/parse'))   return await handleParse(event);
        if (method === 'GET'  && path.endsWith('/health'))  return await handleHealth();
        if (method === 'GET'  && path.endsWith('/audit'))   return await handleAudit(event);
        if (method === 'GET'  && path.endsWith('/search'))  return await handleSearch(event);
        if (method === 'GET'  && path.endsWith('/stats'))   return await handleStats();
        if (method === 'GET'  && path.endsWith('/browse'))  return await handleBrowse(event);
        if (method === 'POST' && path.endsWith('/batch'))   return await handleBatch();

        return json(404, { error: 'Not found', path });
    } catch (err) {
        console.error('[Handler] unhandled error:', err);
        return json(500, { error: 'Internal server error', message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   POST /verify
────────────────────────────────────────────────────────────── */

async function handleVerify(event, ip) {
    const t0   = Date.now();
    const body = parseBody(event);

    const address = {
        street: sanitize(body.street),
        city:   sanitize(body.city),
        state:  sanitize(body.state, 2),
        zip:    (body.zip || '').replace(/\D/g, '').slice(0, 9)
    };

    // 1. Rate limiting
    const rl = await Cache.checkRateLimit(ip);
    if (!rl.allowed) {
        return json(429, { error: 'Rate limit exceeded', resetIn: rl.resetIn });
    }

    // 2. Cache lookup
    const key    = Cache.cacheKey(address);
    const cached = await Cache.get(key);
    if (cached) {
        return json(200, { ...cached, responseTimeMs: Date.now() - t0 });
    }

    // 3. Primary: USPS API
    let result;
    try {
        result = await uspsVerify(address);
    } catch (uspsErr) {
        console.warn('[Verify] USPS failed:', uspsErr.message);

        // 4a. Fallback: SageMaker NER
        const nerResult = await SageMaker.parseAddressNer(
            `${address.street} ${address.city} ${address.state} ${address.zip}`
        );

        if (nerResult && nerResult.confidence >= 60) {
            result = buildOfflineResult(nerResult, address, 'sagemaker-ner');
        } else {
            // 4b. Fallback: Bedrock Claude
            const isComplex = isComplexAddress(address.street);
            const parsed    = await Bedrock.parseAddress(
                `${address.street}, ${address.city}, ${address.state} ${address.zip}`,
                { complex: isComplex }
            ).catch(() => null);

            result = parsed
                ? buildOfflineResult(parsed, address, parsed.source || 'bedrock')
                : buildOfflineResult(address, address, 'offline');
        }
    }

    // 5. ML confidence scoring (refine the confidence)
    try {
        const mlScore = await SageMaker.scoreConfidence({ ...result, ...result.standardized });
        if (mlScore > 0) result.confidence = mlScore;
    } catch { /* non-fatal */ }

    // 6. Titan embedding for k-NN search (async, non-blocking)
    let embedding;
    const stdAddr = result.standardized || {};
    const addrText = [stdAddr.street, stdAddr.city, stdAddr.state, stdAddr.zip]
        .filter(Boolean).join(' ');
    if (addrText) {
        embedding = await Bedrock.embedAddress(addrText).catch(() => []);
    }

    result.responseTimeMs = Date.now() - t0;

    // 7. Cache result (Redis)
    await Cache.set(key, result);

    // 8. Index in OpenSearch (with embedding)
    Search.indexResult(result, ip, embedding).catch(e => console.warn('[Search] index:', e.message));

    // 9. Persist in Databricks
    Databricks.writeResult(result, ip).catch(e => console.warn('[Databricks] write:', e.message));

    return json(200, result);
}

/* ─────────────────────────────────────────────────────────────
   POST /parse  (Bedrock NLP freeform parsing)
────────────────────────────────────────────────────────────── */

async function handleParse(event) {
    const body  = parseBody(event);
    const input = sanitize(body.address || body.text || '');
    if (!input) return json(400, { error: 'Missing "address" field.' });

    const complex = isComplexAddress(input);
    const result  = await Bedrock.parseAddress(input, { complex });
    return json(200, result);
}

/* ─────────────────────────────────────────────────────────────
   GET /health
────────────────────────────────────────────────────────────── */

async function handleHealth() {
    const [redis, os, db, bedrock, sm] = await Promise.allSettled([
        Cache.healthCheck(),
        Search.healthCheck(),
        Databricks.healthCheck(),
        Bedrock.healthCheck(),
        SageMaker.healthCheck()
    ]);

    const pick = r => r.status === 'fulfilled' ? r.value : { status: 'down', error: r.reason?.message };

    const status = {
        api:         'up',
        redis:       pick(redis).status,
        opensearch:  pick(os).status,
        databricks:  pick(db).status,
        bedrock:     pick(bedrock).status,
        sagemaker:   pick(sm).status,
        usps:        'unknown',
        latency: {
            redis:      pick(redis).latencyMs,
            opensearch: pick(os).latencyMs,
            databricks: pick(db).latencyMs,
            bedrock:    pick(bedrock).latencyMs,
            sagemaker:  pick(sm).latencyMs
        }
    };

    const anyDown = ['redis','opensearch','databricks'].some(k => status[k] === 'down');
    return json(anyDown ? 503 : 200, status);
}

/* ─────────────────────────────────────────────────────────────
   GET /audit
────────────────────────────────────────────────────────────── */

async function handleAudit(event) {
    const q = event.queryStringParameters || {};
    const result = await Search.getAuditLog({
        status: q.status || '',
        from:   q.from   || '',
        to:     q.to     || '',
        size:   Math.min(parseInt(q.size || 100, 10), 500)
    });
    return json(200, result);
}

/* ─────────────────────────────────────────────────────────────
   GET /search
────────────────────────────────────────────────────────────── */

async function handleSearch(event) {
    const q     = event.queryStringParameters || {};
    const query = (q.q || '').trim();
    if (!query || query.length < 2) return json(200, { hits: [] });

    // Use k-NN vector search when embedding is feasible, else full-text
    const useKnn = process.env.BEDROCK_KNN_ENABLED === 'true';
    if (useKnn) {
        const vec    = await Bedrock.embedAddress(query);
        const result = vec.length ? await Search.knnSearch(vec) : await Search.searchAddresses(query);
        return json(200, result);
    }

    const result = await Search.searchAddresses(query);
    return json(200, result);
}

/* ─────────────────────────────────────────────────────────────
   GET /stats
────────────────────────────────────────────────────────────── */

async function handleStats() {
    // Try Redis stats cache first (populated by nightly batch job)
    const cached = await Cache.getStatsCache();
    if (cached) return json(200, cached);

    const stats = await Databricks.getStats();
    return json(200, stats);
}

/* ─────────────────────────────────────────────────────────────
   GET /browse
────────────────────────────────────────────────────────────── */

async function handleBrowse(event) {
    const q = event.queryStringParameters || {};
    const result = await Databricks.browseRecords({
        status: q.status || '',
        state:  q.state  || '',
        from:   q.from   || '',
        to:     q.to     || '',
        search: q.search || '',
        limit:  parseInt(q.limit  || 100, 10),
        offset: parseInt(q.offset || 0,   10)
    });
    return json(200, result);
}

/* ─────────────────────────────────────────────────────────────
   POST /batch  (trigger SageMaker Batch Transform stub)
────────────────────────────────────────────────────────────── */

async function handleBatch() {
    // In production this would:
    // 1. Export unverified Databricks records to S3 (Parquet)
    // 2. Create a SageMaker Batch Transform job
    // 3. EventBridge rule picks up job completion and loads results
    return json(202, {
        message: 'Batch job queued. SageMaker Batch Transform will process unverified Databricks records overnight.',
        status:  'accepted'
    });
}

/* ─────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */

function buildOfflineResult(parsed, input, source) {
    return {
        status:     parsed.confidence >= 80 ? 'verified'
                    : parsed.confidence >= 50 ? 'corrected' : 'invalid',
        confidence: parsed.confidence || 0,
        input,
        standardized: {
            street: (parsed.street || input.street || '').toUpperCase(),
            city:   (parsed.city   || input.city   || '').toUpperCase(),
            state:  (parsed.state  || input.state  || '').toUpperCase(),
            zip:    (parsed.zip    || input.zip    || '').replace(/\D/g,'').slice(0,5),
            zip4:   parsed.zip4 || ''
        },
        deliverable:   (parsed.confidence || 0) >= 70,
        dpvMatchCode:  'N',
        dpvVacancy:    'N',
        carrierRoute:  '',
        deliveryPoint: '',
        fromCache:     false,
        cacheAge:      null,
        source,
        notes:         parsed.issues || []
    };
}

function isComplexAddress(street) {
    if (!street) return false;
    return /APO|FPO|DPO|ROUTE|RR\s|HCR|HC\s|GENERAL DELIVERY|PR\s|GU\s|VI\s/i.test(street);
}

function sanitize(str, maxLen = 100) {
    return String(str || '').trim().slice(0, maxLen);
}

function parseBody(event) {
    try {
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString()
            : (event.body || '{}');
        return JSON.parse(raw);
    } catch { return {}; }
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Headers':'Content-Type,X-Api-Key',
            'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

function cors(statusCode) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Headers':'Content-Type,X-Api-Key',
            'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
        },
        body: ''
    };
}
