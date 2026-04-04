/**
 * bedrock.mjs — Amazon Bedrock integration
 *
 * Models used:
 *   • Claude 3.5 Haiku  — freeform address parsing, correction suggestions,
 *                          anomaly explanations (fast + cheap)
 *   • Claude 3 Sonnet   — multi-language / military / complex addresses
 *   • Titan Embeddings V2 — address embedding vectors for k-NN search
 *
 * All model IDs use the us-gov-west-1 Bedrock model ARN prefix.
 * Adjust MODEL_IDs if running in a different region partition.
 */

import {
    BedrockRuntimeClient,
    InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';

const region = process.env.AWS_REGION || 'us-gov-west-1';

const client = new BedrockRuntimeClient({ region });

// Model IDs — GovCloud partition
const MODELS = {
    haiku:      process.env.BEDROCK_MODEL_HAIKU      || 'anthropic.claude-3-5-haiku-20241022-v1:0',
    sonnet:     process.env.BEDROCK_MODEL_SONNET     || 'anthropic.claude-3-sonnet-20240229-v1:0',
    titan_embed: process.env.BEDROCK_MODEL_EMBED     || 'amazon.titan-embed-text-v2:0'
};

/* ─────────────────────────────────────────────────────────────
   Freeform Address Parsing
────────────────────────────────────────────────────────────── */

const PARSE_SYSTEM = `You are a USPS address parsing assistant.
Extract structured address fields from raw user input.
Respond ONLY with a valid JSON object — no explanation, no markdown.`;

const PARSE_SCHEMA = `{
  "streetNumber":  string | null,
  "preDir":        "N"|"S"|"E"|"W"|"NE"|"NW"|"SE"|"SW" | null,
  "streetName":    string | null,
  "streetSuffix":  string | null,
  "postDir":       string | null,
  "secUnit":       "APT"|"STE"|"UNIT"|"BLDG"|"FL"|"RM"|"LOT"|"TRLR" | null,
  "secUnitNum":    string | null,
  "city":          string | null,
  "state":         string | null,
  "zip5":          string | null,
  "zip4":          string | null,
  "addressType":   "standard"|"po_box"|"rural_route"|"military"|"general_delivery",
  "confidence":    0-100,
  "issues":        string[]
}`;

/**
 * Parse a freeform/unstructured address string into USPS component fields.
 * Uses Claude 3.5 Haiku for speed and cost efficiency.
 *
 * @param {string} rawAddress
 * @param {{ complex?: boolean }} [opts]  - complex=true uses Claude 3 Sonnet
 * @returns {Promise<object>}  - Parsed fields + confidence + issues
 */
export async function parseAddress(rawAddress, opts = {}) {
    const modelId = opts.complex ? MODELS.sonnet : MODELS.haiku;

    const userPrompt = `Parse this address into USPS component fields:
"${rawAddress}"

Return JSON matching this exact schema:
${PARSE_SCHEMA}`;

    const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens:        512,
        temperature:       0,
        system:            PARSE_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }]
    });

    const resp = await client.send(new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept:      'application/json',
        body:        Buffer.from(body)
    }));

    const output = JSON.parse(Buffer.from(resp.body).toString());
    const text   = output.content?.[0]?.text || '{}';

    try {
        const parsed = JSON.parse(text);
        // Reconstruct a standard address shape from parsed components
        const street = [
            parsed.streetNumber,
            parsed.preDir,
            parsed.streetName,
            parsed.streetSuffix,
            parsed.postDir,
            parsed.secUnit,
            parsed.secUnitNum
        ].filter(Boolean).join(' ').trim().toUpperCase();

        return {
            ...parsed,
            street: street || null,
            city:   parsed.city  ? parsed.city.toUpperCase()  : null,
            state:  parsed.state ? parsed.state.toUpperCase() : null,
            zip:    parsed.zip5  || null,
            zip4:   parsed.zip4  || null,
            source: 'bedrock-parse',
            model:  modelId
        };
    } catch {
        return { street: null, city: null, state: null, zip: null, confidence: 0, issues: ['Failed to parse Bedrock response'], source: 'bedrock-parse', model: modelId };
    }
}

/* ─────────────────────────────────────────────────────────────
   Correction Suggestions
────────────────────────────────────────────────────────────── */

const CORRECT_SYSTEM = `You are a USPS address correction specialist.
Given a structured address that failed USPS validation, suggest corrections.
Use knowledge of US ZIP code ranges, city names, and USPS street suffix conventions.
Respond ONLY with valid JSON — no explanation, no markdown.`;

/**
 * Generate up to 3 address correction suggestions when USPS API returns no match.
 * Uses Claude 3 Sonnet for better reasoning quality.
 *
 * @param {{ street: string, city: string, state: string, zip: string }} address
 * @param {string} uspsError  - USPS error code/message
 * @returns {Promise<Array<{ street, city, state, zip, confidence, reason }>>}
 */
export async function suggestCorrections(address, uspsError) {
    const userPrompt = `This address failed USPS validation:
Street: ${address.street || ''}
City:   ${address.city   || ''}
State:  ${address.state  || ''}
ZIP:    ${address.zip    || ''}
Error:  ${uspsError}

Suggest up to 3 corrected alternatives ranked by confidence (highest first).
Return ONLY a JSON array:
[{"street":"...","city":"...","state":"...","zip":"...","confidence":0-100,"reason":"..."}]`;

    const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens:        512,
        temperature:       0.1,
        system:            CORRECT_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }]
    });

    try {
        const resp = await client.send(new InvokeModelCommand({
            modelId:     MODELS.sonnet,
            contentType: 'application/json',
            accept:      'application/json',
            body:        Buffer.from(body)
        }));

        const output = JSON.parse(Buffer.from(resp.body).toString());
        const text   = output.content?.[0]?.text || '[]';
        const suggestions = JSON.parse(text);
        return Array.isArray(suggestions) ? suggestions : [];
    } catch (err) {
        console.warn('[Bedrock] suggestCorrections failed:', err.message);
        return [];
    }
}

/* ─────────────────────────────────────────────────────────────
   Address Embeddings (Titan Embeddings V2)
────────────────────────────────────────────────────────────── */

/**
 * Generate a semantic embedding vector for an address string.
 * Vectors are stored in OpenSearch for k-NN similarity search.
 *
 * @param {string} addressText  - e.g. "123 MAIN ST SPRINGFIELD IL 62701"
 * @returns {Promise<number[]>}  - 1536-dimensional float array
 */
export async function embedAddress(addressText) {
    const body = JSON.stringify({
        inputText:  addressText,
        dimensions: 1536,
        normalize:  true
    });

    try {
        const resp = await client.send(new InvokeModelCommand({
            modelId:     MODELS.titan_embed,
            contentType: 'application/json',
            accept:      'application/json',
            body:        Buffer.from(body)
        }));

        const output = JSON.parse(Buffer.from(resp.body).toString());
        return output.embedding || [];
    } catch (err) {
        console.warn('[Bedrock] embedAddress failed:', err.message);
        return [];
    }
}

/* ─────────────────────────────────────────────────────────────
   Health check
────────────────────────────────────────────────────────────── */

/**
 * Verify Bedrock connectivity with a trivial embedding call.
 * @returns {Promise<{ status: string, latencyMs: number }>}
 */
export async function healthCheck() {
    const t0 = Date.now();
    try {
        const vec = await embedAddress('test');
        return { status: vec.length > 0 ? 'up' : 'degraded', latencyMs: Date.now() - t0 };
    } catch (err) {
        return { status: 'down', error: err.message };
    }
}
