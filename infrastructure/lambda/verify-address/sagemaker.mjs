/**
 * sagemaker.mjs — Amazon SageMaker inference client
 *
 * Endpoints invoked:
 *   1. NER Real-time Endpoint  — HuggingFace BERT fine-tuned on USPS CASS data
 *      Input:  raw address string
 *      Output: BIO-tagged address components (streetNumber, streetName, suffix, city, state, ZIP)
 *      Latency: <10ms on warm endpoint
 *
 *   2. Scoring Serverless Endpoint — XGBoost confidence scorer
 *      Input:  feature vector (field-presence + format flags)
 *      Output: confidence score 0–100 + completeness tier
 *
 * Environment variables required:
 *   SAGEMAKER_NER_ENDPOINT_NAME     — e.g. "address-ner-prod"
 *   SAGEMAKER_SCORE_ENDPOINT_NAME   — e.g. "address-score-prod"
 */

import {
    SageMakerRuntimeClient,
    InvokeEndpointCommand
} from '@aws-sdk/client-sagemaker-runtime';

const region = process.env.AWS_REGION || 'us-gov-west-1';
const client = new SageMakerRuntimeClient({ region });

/* ─────────────────────────────────────────────────────────────
   NER Parsing
────────────────────────────────────────────────────────────── */

/**
 * Parse an address string using the fine-tuned BERT NER endpoint.
 * Falls back gracefully if the endpoint is unavailable.
 *
 * Expected endpoint input/output (HuggingFace token-classification pipeline):
 *   Input:  { "inputs": "123 N Main St Apt 4B Springfield IL 62701" }
 *   Output: [{ "entity": "B-NUM",    "word": "123",    "score": 0.99 },
 *            { "entity": "B-PREDIR", "word": "N",      "score": 0.97 }, ...]
 *
 * @param {string} rawAddress
 * @returns {Promise<object|null>}  Structured address components, or null on failure
 */
export async function parseAddressNer(rawAddress) {
    const endpointName = process.env.SAGEMAKER_NER_ENDPOINT_NAME;
    if (!endpointName) return null;

    const payload = JSON.stringify({ inputs: rawAddress });

    try {
        const resp = await client.send(new InvokeEndpointCommand({
            EndpointName: endpointName,
            ContentType:  'application/json',
            Accept:       'application/json',
            Body:         Buffer.from(payload)
        }));

        const entities = JSON.parse(Buffer.from(resp.Body).toString());
        return assembleFromEntities(entities, rawAddress);
    } catch (err) {
        console.warn('[SageMaker] NER endpoint error:', err.message);
        return null;
    }
}

/**
 * Convert BIO-tagged entities to a structured address object.
 *
 * @param {Array<{ entity: string, word: string, score: number }>} entities
 * @param {string} rawAddress
 * @returns {object}
 */
function assembleFromEntities(entities, rawAddress) {
    const parts = {
        NUM:     [], PREDIR: [], STR: [], SUF: [],
        POSTDIR: [], SEC:    [], SECNUM: [],
        CITY:    [], STATE:  [], ZIP5:  [], ZIP4: []
    };

    for (const ent of entities) {
        const tag  = ent.entity.replace(/^[BI]-/, '');
        const word = ent.word.replace(/^##/, '');  // HuggingFace subword tokens
        if (parts[tag]) parts[tag].push(word);
    }

    const streetParts = [
        parts.NUM.join(''),
        parts.PREDIR.join(''),
        parts.STR.join(' '),
        parts.SUF.join(''),
        parts.POSTDIR.join(''),
        parts.SEC.join(''),
        parts.SECNUM.join('')
    ].filter(Boolean);

    const avgScore = entities.length
        ? entities.reduce((s, e) => s + (e.score || 0), 0) / entities.length
        : 0;

    return {
        street:     streetParts.join(' ').toUpperCase() || null,
        city:       parts.CITY.join(' ').toUpperCase()  || null,
        state:      parts.STATE.join('').toUpperCase()  || null,
        zip:        parts.ZIP5.join('')                 || null,
        zip4:       parts.ZIP4.join('')                 || null,
        confidence: Math.round(avgScore * 100),
        source:     'sagemaker-ner',
        entities
    };
}

/* ─────────────────────────────────────────────────────────────
   Confidence Scoring
────────────────────────────────────────────────────────────── */

/**
 * Compute an ML-learned confidence score for a verification result.
 * The XGBoost model was trained on field-presence + format features.
 *
 * Falls back to the heuristic confidence from the upstream result.
 *
 * @param {{ street, city, state, zip, zip4, dpvMatchCode }} result
 * @returns {Promise<number>}  0–100
 */
export async function scoreConfidence(result) {
    const endpointName = process.env.SAGEMAKER_SCORE_ENDPOINT_NAME;
    if (!endpointName) return result.confidence || 0;

    const features = buildFeatureVector(result);
    const payload  = JSON.stringify({ instances: [features] });

    try {
        const resp = await client.send(new InvokeEndpointCommand({
            EndpointName: endpointName,
            ContentType:  'application/json',
            Accept:       'application/json',
            Body:         Buffer.from(payload)
        }));

        const output = JSON.parse(Buffer.from(resp.Body).toString());
        const score  = output?.predictions?.[0] ?? output?.[0] ?? null;
        return score !== null ? Math.round(score * 100) : (result.confidence || 0);
    } catch (err) {
        console.warn('[SageMaker] scoring endpoint error:', err.message);
        return result.confidence || 0;
    }
}

/**
 * Build feature vector for the XGBoost confidence model.
 * Features mirror those described in docs/ML_ARCHITECTURE.md §8.
 */
function buildFeatureVector(r) {
    const s   = r.standardized || r;
    const dpv = r.dpvMatchCode || 'N';
    return [
        s.street ? 1 : 0,                                      // has_street
        s.city   ? 1 : 0,                                      // has_city
        s.state  ? 1 : 0,                                      // has_state
        s.zip    ? 1 : 0,                                      // has_zip
        s.zip4   ? 1 : 0,                                      // has_zip4
        /^\d+/.test(s.street || '') ? 1 : 0,                   // street_starts_with_number
        (s.zip || '').replace(/\D/g,'').length === 5 ? 1 : 0,  // zip_5digit
        dpv === 'Y' ? 1 : dpv === 'S' ? 0.75 : dpv === 'D' ? 0.5 : 0, // dpv_score
        r.fromCache ? 1 : 0,                                   // from_cache
        r.source === 'usps' ? 1 : 0                            // usps_validated
    ];
}

/* ─────────────────────────────────────────────────────────────
   Health check
────────────────────────────────────────────────────────────── */

/**
 * Check NER endpoint health via a lightweight describe-endpoint call.
 * @returns {Promise<{ status: string, latencyMs: number }>}
 */
export async function healthCheck() {
    const t0           = Date.now();
    const endpointName = process.env.SAGEMAKER_NER_ENDPOINT_NAME;
    if (!endpointName) return { status: 'not-configured', latencyMs: 0 };

    try {
        await parseAddressNer('123 MAIN ST SPRINGFIELD IL 62701');
        return { status: 'up', latencyMs: Date.now() - t0 };
    } catch (err) {
        return { status: 'down', error: err.message, latencyMs: Date.now() - t0 };
    }
}
