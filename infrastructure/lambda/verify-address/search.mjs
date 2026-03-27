/**
 * search.mjs — OpenSearch client
 *
 * Responsibilities:
 *   • Index every verification result as an audit log entry
 *   • Store Titan embedding vectors for k-NN address similarity search
 *   • Full-text search across verified addresses (admin panel)
 *   • Audit log queries with date/status filters
 *
 * Index: address-verifications (audit log + k-NN)
 */

import { Client }          from '@opensearch-project/opensearch';
import { AwsSigv4Signer }  from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-providers';

const INDEX = 'address-verifications';
const DIMS  = 1536;   // Amazon Titan Embeddings V2 output dimension

/** @type {Client|null} */
let osClient = null;

/**
 * Get (or create) a singleton OpenSearch client with AWS SigV4 signing.
 */
function getClient() {
    if (osClient) return osClient;

    const endpoint = process.env.OPENSEARCH_ENDPOINT;
    const region   = process.env.AWS_REGION || 'us-gov-west-1';

    osClient = new Client({
        ...AwsSigv4Signer({
            region,
            service: 'es',
            getCredentials: defaultProvider()
        }),
        node: `https://${endpoint}`,
        maxRetries: 2,
        requestTimeout: 5_000
    });

    return osClient;
}

/**
 * Ensure the index exists with correct mapping (including k-NN vector field).
 * Called once during cold start; idempotent.
 */
export async function ensureIndex() {
    const client = getClient();
    const exists = await client.indices.exists({ index: INDEX });
    if (exists.body) return;

    await client.indices.create({
        index: INDEX,
        body: {
            settings: {
                'index.knn': true,
                number_of_shards:   2,
                number_of_replicas: 1
            },
            mappings: {
                properties: {
                    id:                  { type: 'keyword' },
                    input_street:        { type: 'text',    fields: { keyword: { type: 'keyword' } } },
                    input_city:          { type: 'text',    fields: { keyword: { type: 'keyword' } } },
                    input_state:         { type: 'keyword' },
                    input_zip:           { type: 'keyword' },
                    standardized_street: { type: 'text',    fields: { keyword: { type: 'keyword' } } },
                    city:                { type: 'text',    fields: { keyword: { type: 'keyword' } } },
                    state:               { type: 'keyword' },
                    zip:                 { type: 'keyword' },
                    zip4:                { type: 'keyword' },
                    status:              { type: 'keyword' },
                    confidence:          { type: 'integer' },
                    dpv_match_code:      { type: 'keyword' },
                    dpv_vacancy:         { type: 'keyword' },
                    carrier_route:       { type: 'keyword' },
                    from_cache:          { type: 'boolean' },
                    source:              { type: 'keyword' },
                    response_ms:         { type: 'integer' },
                    request_ip:          { type: 'ip'      },
                    verified_at:         { type: 'date'    },
                    embedding: {
                        type:      'knn_vector',
                        dimension: DIMS,
                        method: {
                            name:       'hnsw',
                            space_type: 'l2',
                            engine:     'nmslib'
                        }
                    }
                }
            }
        }
    });
}

/**
 * Index a verification result into OpenSearch.
 * @param {object} result  - Canonical verification result
 * @param {string} ip      - Requester IP
 * @param {number[]} [embedding] - Optional Titan embedding vector
 */
export async function indexResult(result, ip, embedding) {
    const client = getClient();
    const s      = result.standardized || {};
    const inp    = result.input        || {};

    const doc = {
        id:                  result.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        input_street:        inp.street,
        input_city:          inp.city,
        input_state:         inp.state,
        input_zip:           inp.zip,
        standardized_street: s.street,
        city:                s.city,
        state:               s.state,
        zip:                 s.zip,
        zip4:                s.zip4,
        status:              result.status,
        confidence:          result.confidence,
        dpv_match_code:      result.dpvMatchCode,
        dpv_vacancy:         result.dpvVacancy,
        carrier_route:       result.carrierRoute,
        from_cache:          result.fromCache,
        source:              result.source,
        response_ms:         result.responseTimeMs,
        request_ip:          ip,
        verified_at:         new Date().toISOString(),
        ...(embedding ? { embedding } : {})
    };

    try {
        await client.index({ index: INDEX, id: doc.id, body: doc, refresh: 'false' });
    } catch (err) {
        console.warn('[OpenSearch] index failed:', err.message);
    }
}

/**
 * Full-text search for verified addresses.
 * @param {string} query
 * @param {number} [size=20]
 * @returns {Promise<{ hits: object[] }>}
 */
export async function searchAddresses(query, size = 20) {
    const client = getClient();
    try {
        const resp = await client.search({
            index: INDEX,
            body: {
                size,
                query: {
                    multi_match: {
                        query,
                        fields: [
                            'standardized_street^3',
                            'input_street^2',
                            'city^2',
                            'state',
                            'zip'
                        ],
                        type: 'best_fields',
                        fuzziness: 'AUTO'
                    }
                },
                sort: [{ verified_at: { order: 'desc' } }]
            }
        });
        return { hits: resp.body.hits.hits.map(h => ({ ...h._source, _id: h._id, _score: h._score })) };
    } catch (err) {
        console.warn('[OpenSearch] search failed:', err.message);
        return { hits: [] };
    }
}

/**
 * k-NN similarity search using an embedding vector.
 * @param {number[]} vector  - Titan embedding
 * @param {number}   [k=10]
 * @returns {Promise<{ hits: object[] }>}
 */
export async function knnSearch(vector, k = 10) {
    const client = getClient();
    try {
        const resp = await client.search({
            index: INDEX,
            body: {
                size: k,
                query: { knn: { embedding: { vector, k } } }
            }
        });
        return { hits: resp.body.hits.hits.map(h => ({ ...h._source, _score: h._score })) };
    } catch (err) {
        console.warn('[OpenSearch] k-NN search failed:', err.message);
        return { hits: [] };
    }
}

/**
 * Retrieve audit log with optional filters.
 * @param {{ status?: string, from?: string, to?: string, size?: number }} filters
 * @returns {Promise<{ hits: object[], total: number }>}
 */
export async function getAuditLog(filters = {}) {
    const client = getClient();
    const must   = [];

    if (filters.status) must.push({ term: { status: filters.status } });
    if (filters.from || filters.to) {
        must.push({ range: { verified_at: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to   ? { lte: filters.to   } : {})
        }}});
    }

    try {
        const resp = await client.search({
            index: INDEX,
            body: {
                size:  filters.size || 100,
                query: must.length ? { bool: { must } } : { match_all: {} },
                sort:  [{ verified_at: { order: 'desc' } }]
            }
        });
        return {
            hits:  resp.body.hits.hits.map(h => h._source),
            total: resp.body.hits.total.value
        };
    } catch (err) {
        console.warn('[OpenSearch] audit log query failed:', err.message);
        return { hits: [], total: 0 };
    }
}

/**
 * Health check.
 * @returns {Promise<{ status: string, latencyMs: number }>}
 */
export async function healthCheck() {
    const t0 = Date.now();
    try {
        const client = getClient();
        await client.cluster.health();
        return { status: 'up', latencyMs: Date.now() - t0 };
    } catch (err) {
        return { status: 'down', error: err.message };
    }
}
