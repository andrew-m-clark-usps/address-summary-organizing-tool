/**
 * address-embedder.js — TensorFlow.js Universal Sentence Encoder (USE)
 * for semantic address similarity in the browser.
 *
 * Loaded lazily; requires these CDN scripts to be included first:
 *   <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/universal-sentence-encoder@1.3.3/dist/universal_sentence_encoder.min.js"></script>
 *
 * Usage:
 *   const sim = await AddressEmbedder.similarity('123 main st', '123 main street');
 *   // → 0.97
 *
 *   const score = await AddressEmbedder.addressMatchScore(recA, recB);
 *   // → { neural: 0.94, components: { street: 0.97, city: 1.0, state: 1.0 } }
 *
 * The USE Lite model (~25 MB) is downloaded once from CDN and cached
 * by the browser. Subsequent calls reuse the in-memory model.
 */

'use strict';

const AddressEmbedder = (() => {

    /** @type {any|null} USE model instance */
    let _model = null;
    /** @type {Promise<any>|null} */
    let _loadPromise = null;
    let _loadFailed  = false;

    /* ── Model loading ─────────────────────────────────────── */

    /**
     * Lazily load the Universal Sentence Encoder (Lite).
     * Safe to call from multiple call sites; only loads once.
     * @returns {Promise<any>} USE model
     */
    async function loadModel() {
        if (_model)        return _model;
        if (_loadFailed)   return null;
        if (_loadPromise)  return _loadPromise;

        _loadPromise = (async () => {
            // Verify that the TF.js USE library was loaded from CDN
            if (typeof use === 'undefined') {
                console.warn('[AddressEmbedder] TF.js USE library not loaded. Semantic similarity disabled.');
                _loadFailed = true;
                return null;
            }
            try {
                console.info('[AddressEmbedder] Loading Universal Sentence Encoder …');
                _model = await use.load();
                console.info('[AddressEmbedder] USE model ready.');
                return _model;
            } catch (err) {
                console.warn('[AddressEmbedder] USE load failed:', err.message);
                _loadFailed = true;
                return null;
            }
        })();

        return _loadPromise;
    }

    /* ── Core embedding ────────────────────────────────────── */

    /**
     * Generate USE embedding vectors for an array of strings.
     * @param {string[]} texts
     * @returns {Promise<Float32Array[]>}  Array of 512-dimensional vectors
     */
    async function embed(texts) {
        const model = await loadModel();
        if (!model) return texts.map(() => null);

        const tensor     = await model.embed(texts);
        const flat       = await tensor.array();   // shape [n, 512]
        tensor.dispose();
        return flat;
    }

    /**
     * Compute cosine similarity between two float vectors.
     * @param {number[]} a
     * @param {number[]} b
     * @returns {number}  0.0–1.0
     */
    function cosine(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na  += a[i] * a[i];
            nb  += b[i] * b[i];
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
    }

    /* ── Public API ────────────────────────────────────────── */

    /**
     * Semantic similarity between two text strings.
     * Returns null if the USE model is not available.
     *
     * @param {string} a
     * @param {string} b
     * @returns {Promise<number|null>}  Cosine similarity 0.0–1.0
     */
    async function similarity(a, b) {
        if (!a || !b) return 0;
        const vecs = await embed([a, b]);
        if (!vecs[0] || !vecs[1]) return null;
        return cosine(vecs[0], vecs[1]);
    }

    /**
     * Compute a neural address match score between two address records.
     * Compares street, city, and full-address strings using USE embeddings.
     * Weights: street × 0.50 + city × 0.30 + full-address × 0.20.
     *
     * @param {{ street, city, state, zip }} recA
     * @param {{ street, city, state, zip }} recB
     * @returns {Promise<{ neural: number, components: object }|null>}
     */
    async function addressMatchScore(recA, recB) {
        const norm   = s => String(s || '').toUpperCase().trim();
        const fullA  = [norm(recA.street), norm(recA.city), norm(recA.state), norm(recA.zip)].filter(Boolean).join(' ');
        const fullB  = [norm(recB.street), norm(recB.city), norm(recB.state), norm(recB.zip)].filter(Boolean).join(' ');
        const texts  = [norm(recA.street), norm(recB.street), norm(recA.city), norm(recB.city), fullA, fullB];

        const vecs = await embed(texts);
        if (vecs.some(v => !v)) return null;

        const streetSim = cosine(vecs[0], vecs[1]);
        const citySim   = cosine(vecs[2], vecs[3]);
        const fullSim   = cosine(vecs[4], vecs[5]);

        const neural = streetSim * 0.50 + citySim * 0.30 + fullSim * 0.20;

        return {
            neural: Math.round(neural * 100) / 100,
            components: {
                street: Math.round(streetSim * 100) / 100,
                city:   Math.round(citySim   * 100) / 100,
                full:   Math.round(fullSim   * 100) / 100
            }
        };
    }

    /**
     * Rank a list of candidate records by semantic similarity to a query.
     * Used in the address analyzer to surface the best fuzzy matches.
     *
     * @param {{ street, city, state, zip }} query
     * @param {Array<{ street, city, state, zip }>} candidates
     * @param {number} [topK=5]
     * @returns {Promise<Array<{ index, score }>>}  Top-K results sorted by score
     */
    async function rankCandidates(query, candidates, topK = 5) {
        if (!candidates || !candidates.length) return [];

        const norm    = s => String(s || '').toUpperCase().trim();
        const queryTx = [norm(query.street), norm(query.city), norm(query.state)].filter(Boolean).join(' ');
        const candTxs = candidates.map(c => [norm(c.street), norm(c.city), norm(c.state)].filter(Boolean).join(' '));

        const allTexts = [queryTx, ...candTxs];
        const vecs     = await embed(allTexts);
        if (!vecs[0]) return [];

        const queryVec = vecs[0];
        const ranked   = candidates.map((_, i) => ({
            index: i,
            score: vecs[i + 1] ? cosine(queryVec, vecs[i + 1]) : 0
        }));

        ranked.sort((a, b) => b.score - a.score);
        return ranked.slice(0, topK);
    }

    /**
     * Quick health-check: verify the USE model loaded correctly.
     * @returns {Promise<{ loaded: boolean, dims: number }>}
     */
    async function status() {
        const model = await loadModel();
        if (!model) return { loaded: false, dims: 0 };
        const vecs  = await embed(['test']);
        return { loaded: !!vecs[0], dims: vecs[0] ? vecs[0].length : 0 };
    }

    /** Returns true if the USE model has been loaded and is ready. */
    function isReady() { return !!_model; }

    // Kick off model loading in the background when this script is parsed
    // (non-blocking; will be ready before most user interactions)
    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            loadModel().catch(() => {/* handled inside loadModel */});
        });
    }

    return {
        load:              loadModel,
        embed,
        similarity,
        addressMatchScore,
        rankCandidates,
        status,
        isReady
    };

})();
