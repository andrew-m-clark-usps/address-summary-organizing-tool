/**
 * matcher.js — Address Matching Engine
 * Handles exact matching, fuzzy matching, and confidence scoring
 */

const AddressMatcher = (() => {

    // Street type abbreviation map
    const STREET_ABBR = {
        'STREET': 'ST', 'AVENUE': 'AVE', 'ROAD': 'RD', 'DRIVE': 'DR',
        'BOULEVARD': 'BLVD', 'LANE': 'LN', 'COURT': 'CT', 'CIRCLE': 'CIR',
        'PLACE': 'PL', 'TERRACE': 'TER', 'WAY': 'WAY', 'TRAIL': 'TRL',
        'HIGHWAY': 'HWY', 'PARKWAY': 'PKWY', 'EXPRESSWAY': 'EXPY',
        'APARTMENT': 'APT', 'SUITE': 'STE', 'UNIT': 'UNIT',
        'NORTH': 'N', 'SOUTH': 'S', 'EAST': 'E', 'WEST': 'W',
        'NORTHEAST': 'NE', 'NORTHWEST': 'NW', 'SOUTHEAST': 'SE', 'SOUTHWEST': 'SW',
        'MOUNT': 'MT', 'SAINT': 'ST', 'FORT': 'FT',
        'BUILDING': 'BLDG', 'FLOOR': 'FL', 'DEPARTMENT': 'DEPT',
        'JUNCTION': 'JCT', 'CROSSING': 'XING'
    };

    // Valid US state codes
    const VALID_STATES = new Set([
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
        'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
        'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
        'TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP'
    ]);

    /**
     * Standardize an address string for matching
     */
    function standardize(str) {
        if (!str || typeof str !== 'string') return '';
        let s = str.toUpperCase().trim();
        // Remove punctuation except # and -
        s = s.replace(/[^A-Z0-9\s#\-]/g, ' ');
        // Normalize multiple spaces
        s = s.replace(/\s+/g, ' ').trim();
        // Replace full words with abbreviations
        Object.entries(STREET_ABBR).forEach(([full, abbr]) => {
            const regex = new RegExp(`\\b${full}\\b`, 'g');
            s = s.replace(regex, abbr);
        });
        return s;
    }

    /**
     * Levenshtein distance between two strings (optimized for speed)
     */
    function levenshtein(a, b) {
        if (a === b) return 0;
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const maxLen = Math.max(a.length, b.length);
        // Skip expensive computation for very different length strings
        if (Math.abs(a.length - b.length) / maxLen > 0.6) {
            return maxLen;
        }
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b[i - 1] === a[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    /**
     * Calculate string similarity (0-1)
     */
    function stringSimilarity(a, b) {
        if (!a && !b) return 1;
        if (!a || !b) return 0;
        const sa = standardize(a);
        const sb = standardize(b);
        if (sa === sb) return 1;
        const dist = levenshtein(sa, sb);
        const maxLen = Math.max(sa.length, sb.length);
        return maxLen === 0 ? 1 : 1 - (dist / maxLen);
    }

    /**
     * Normalize a ZIP code to 5 digits
     */
    function normalizeZip(zip) {
        if (!zip) return '';
        const s = String(zip).replace(/\D/g, '');
        return s.substring(0, 5);
    }

    /**
     * Normalize state code
     */
    function normalizeState(state) {
        if (!state) return '';
        return state.toString().toUpperCase().trim().substring(0, 2);
    }

    /**
     * Build a combined address key for exact matching
     */
    function buildKey(record) {
        const street = standardize(record.street || '');
        const city = (record.city || '').toUpperCase().trim();
        const state = normalizeState(record.state);
        const zip = normalizeZip(record.zip);
        return `${street}|${city}|${state}|${zip}`;
    }

    /**
     * Build a ZIP+street key for fast candidate lookup
     */
    function buildZipKey(record) {
        return normalizeZip(record.zip) + '|' + normalizeState(record.state);
    }

    /**
     * Calculate confidence score between two records (0-100)
     * Weights: ZIP=40%, State=30%, City=20%, Street=10%
     * Optional bonus weights: addressLine2, county, zipPlus4, carrierRoute, congressionalDistrict
     */
    function calculateConfidence(recA, recB, weights) {
        const w = weights || { zip: 40, state: 30, city: 20, street: 10 };
        const bonus = {
            addressLine2: w.addressLine2 || 0,
            county: w.county || 0,
            zipPlus4: w.zipPlus4 || 0,
            carrierRoute: w.carrierRoute || 0,
            congressionalDistrict: w.congressionalDistrict || 0
        };

        // ZIP comparison
        const zipA = normalizeZip(recA.zip);
        const zipB = normalizeZip(recB.zip);
        let zipScore = 0;
        if (zipA && zipB) {
            zipScore = zipA === zipB ? 100 : (zipA.substring(0,3) === zipB.substring(0,3) ? 50 : 0);
        } else if (!zipA && !zipB) {
            zipScore = 50;
        }

        // State comparison
        const stateA = normalizeState(recA.state);
        const stateB = normalizeState(recB.state);
        let stateScore = 0;
        if (stateA && stateB) {
            stateScore = stateA === stateB ? 100 : 0;
        } else if (!stateA && !stateB) {
            stateScore = 50;
        }

        // City comparison
        const cityA = (recA.city || '').toUpperCase().trim();
        const cityB = (recB.city || '').toUpperCase().trim();
        let cityScore = 0;
        if (cityA || cityB) {
            cityScore = Math.round(stringSimilarity(cityA, cityB) * 100);
        } else {
            cityScore = 50;
        }

        // Street comparison
        const streetA = standardize(recA.street || '');
        const streetB = standardize(recB.street || '');
        let streetScore = 0;
        if (streetA || streetB) {
            streetScore = Math.round(stringSimilarity(streetA, streetB) * 100);
        } else {
            streetScore = 50;
        }

        // Core score (normalized to base weights)
        const baseTotal = w.zip + w.state + w.city + w.street;
        let score = (zipScore * w.zip + stateScore * w.state + cityScore * w.city + streetScore * w.street) / baseTotal;

        // Optional bonus fields — each adds a proportional boost if both records have values
        const bonusFields = [
            { key: 'address2',             weight: bonus.addressLine2,           scoreA: recA.address2,             scoreB: recB.address2 },
            { key: 'county',               weight: bonus.county,                 scoreA: recA.county,               scoreB: recB.county },
            { key: 'zipPlus4',             weight: bonus.zipPlus4,               scoreA: recA.zipPlus4,             scoreB: recB.zipPlus4 },
            { key: 'carrierRoute',         weight: bonus.carrierRoute,           scoreA: recA.carrierRoute,         scoreB: recB.carrierRoute },
            { key: 'congressionalDistrict',weight: bonus.congressionalDistrict,  scoreA: recA.congressionalDistrict,scoreB: recB.congressionalDistrict }
        ];

        let bonusScore = 0;
        let bonusWeightTotal = 0;
        bonusFields.forEach(({ weight, scoreA, scoreB }) => {
            if (!weight) return;
            bonusWeightTotal += weight;
            if (scoreA && scoreB) {
                bonusScore += stringSimilarity(String(scoreA), String(scoreB)) * 100 * weight;
            } else if (!scoreA && !scoreB) {
                bonusScore += 50 * weight;
            }
        });

        if (bonusWeightTotal > 0) {
            score = (score * baseTotal + bonusScore) / (baseTotal + bonusWeightTotal);
        }

        return {
            score: Math.min(100, Math.max(0, Math.round(score))),
            zipScore,
            stateScore,
            cityScore,
            streetScore
        };
    }

    /**
     * Get the confidence label based on score
     */
    function getConfidenceLabel(score) {
        if (score === 100) return 'perfect';
        if (score >= 90) return 'high';
        if (score >= 70) return 'partial';
        if (score >= 50) return 'low';
        return 'none';
    }

    /**
     * Get badge class for confidence
     */
    function getConfidenceBadgeClass(score) {
        return 'badge-' + getConfidenceLabel(score);
    }

    /**
     * Detect discrepancy types between matched records
     */
    function detectDiscrepancies(recA, recB) {
        const discrepancies = [];
        const zipA = normalizeZip(recA.zip);
        const zipB = normalizeZip(recB.zip);
        if (zipA && zipB && zipA !== zipB) discrepancies.push('ZIP Mismatch');
        const stateA = normalizeState(recA.state);
        const stateB = normalizeState(recB.state);
        if (stateA && stateB && stateA !== stateB) discrepancies.push('State Mismatch');
        const cityA = (recA.city || '').toUpperCase().trim();
        const cityB = (recB.city || '').toUpperCase().trim();
        if (cityA && cityB && stringSimilarity(cityA, cityB) < 0.85) discrepancies.push('City Mismatch');
        const streetA = standardize(recA.street || '');
        const streetB = standardize(recB.street || '');
        if (streetA && streetB && stringSimilarity(streetA, streetB) < 0.85) discrepancies.push('Street Mismatch');
        return discrepancies;
    }

    /**
     * Main matching function
     * @param {Array} dataA - Records from System A
     * @param {Array} dataB - Records from System B
     * @param {Object} options - { threshold: 70, weights: {...}, onProgress: fn }
     * @returns {Object} { matched, unmatchedA, unmatchedB }
     */
    function matchRecords(dataA, dataB, options = {}) {
        const threshold = options.threshold || 70;
        const weights = options.weights || { zip: 40, state: 30, city: 20, street: 10 };
        const onProgress = options.onProgress || (() => {});

        const matched = [];
        const unmatchedA = [];
        const matchedBIndices = new Set();

        // Build lookup indexes for B
        const exactMap = new Map();      // exact key -> index
        const zipStateMap = new Map();   // zip|state -> [indices]

        dataB.forEach((rec, idx) => {
            const key = buildKey(rec);
            if (!exactMap.has(key)) exactMap.set(key, idx);
            const zk = buildZipKey(rec);
            if (!zipStateMap.has(zk)) zipStateMap.set(zk, []);
            zipStateMap.get(zk).push(idx);
        });

        const total = dataA.length;

        for (let i = 0; i < dataA.length; i++) {
            const recA = dataA[i];
            const keyA = buildKey(recA);

            // Progress callback every 500 records
            if (i % 500 === 0) onProgress(i, total);

            // 1. Try exact match
            if (exactMap.has(keyA)) {
                const bIdx = exactMap.get(keyA);
                if (!matchedBIndices.has(bIdx)) {
                    const recB = dataB[bIdx];
                    matchedBIndices.add(bIdx);
                    const discrepancies = detectDiscrepancies(recA, recB);
                    matched.push({
                        recordA: recA,
                        recordB: recB,
                        score: 100,
                        label: 'perfect',
                        discrepancies,
                        zipScore: 100,
                        stateScore: 100,
                        cityScore: 100,
                        streetScore: 100,
                        matchType: 'exact',
                        aiScore: calculateCompositeAIScore(recA, recB),
                        aiScoreBreakdown: getAIScoreBreakdown(recA, recB),
                        addressTypeA: detectAddressType(recA),
                        addressTypeB: detectAddressType(recB),
                        completenessA: calculateRecordCompleteness(recA),
                        completenessB: calculateRecordCompleteness(recB)
                    });
                    continue;
                }
            }

            // 2. Fuzzy match using ZIP+State candidates
            const zipKey = buildZipKey(recA);
            const candidates = zipStateMap.get(zipKey) || [];

            let bestScore = 0;
            let bestBIdx = -1;
            let bestResult = null;

            for (const bIdx of candidates) {
                if (matchedBIndices.has(bIdx)) continue;
                const result = calculateConfidence(recA, dataB[bIdx], weights);
                if (result.score > bestScore) {
                    bestScore = result.score;
                    bestBIdx = bIdx;
                    bestResult = result;
                }
                // Short circuit on perfect score
                if (bestScore === 100) break;
            }

            // 3. If no ZIP+State candidates found, do broader state search
            if (bestScore < threshold && candidates.length === 0) {
                const stateKey = normalizeState(recA.state);
                // Try all B records with same state (limited for performance)
                let checked = 0;
                for (const [zk, indices] of zipStateMap) {
                    if (!zk.endsWith('|' + stateKey)) continue;
                    for (const bIdx of indices) {
                        if (matchedBIndices.has(bIdx) || checked > 200) continue;
                        const result = calculateConfidence(recA, dataB[bIdx], weights);
                        if (result.score > bestScore) {
                            bestScore = result.score;
                            bestBIdx = bIdx;
                            bestResult = result;
                        }
                        checked++;
                    }
                }
            }

            if (bestScore >= threshold && bestBIdx >= 0) {
                const recB = dataB[bestBIdx];
                matchedBIndices.add(bestBIdx);
                const discrepancies = detectDiscrepancies(recA, recB);
                matched.push({
                    recordA: recA,
                    recordB: recB,
                    score: bestScore,
                    label: getConfidenceLabel(bestScore),
                    discrepancies,
                    zipScore: bestResult ? bestResult.zipScore : 0,
                    stateScore: bestResult ? bestResult.stateScore : 0,
                    cityScore: bestResult ? bestResult.cityScore : 0,
                    streetScore: bestResult ? bestResult.streetScore : 0,
                    matchType: 'fuzzy',
                    aiScore: calculateCompositeAIScore(recA, recB),
                    aiScoreBreakdown: getAIScoreBreakdown(recA, recB),
                    addressTypeA: detectAddressType(recA),
                    addressTypeB: detectAddressType(recB),
                    completenessA: calculateRecordCompleteness(recA),
                    completenessB: calculateRecordCompleteness(recB)
                });
            } else {
                unmatchedA.push(recA);
            }
        }

        onProgress(total, total);

        // Records in B not matched
        const unmatchedB = dataB.filter((_, idx) => !matchedBIndices.has(idx));

        return { matched, unmatchedA, unmatchedB };
    }

    // ─── AI Similarity Functions ────────────────────────────────────────────────

    /**
     * Split a standardized string into an array of tokens
     */
    function tokenize(str) {
        const s = standardize(str);
        return s ? s.split(/\s+/).filter(t => t.length > 0) : [];
    }

    /**
     * Jaccard similarity on token sets: |intersection| / |union| (0-1)
     */
    function calculateJaccardSimilarity(a, b) {
        const setA = new Set(tokenize(a));
        const setB = new Set(tokenize(b));
        if (setA.size === 0 && setB.size === 0) return 1;
        if (setA.size === 0 || setB.size === 0) return 0;
        let intersection = 0;
        setA.forEach(t => { if (setB.has(t)) intersection++; });
        const union = setA.size + setB.size - intersection;
        return intersection / union;
    }

    /**
     * TF-IDF-like cosine similarity between two token arrays (0-1)
     */
    function calculateCosineSimilarity(tokensA, tokensB) {
        if (!tokensA.length && !tokensB.length) return 1;
        if (!tokensA.length || !tokensB.length) return 0;

        const freq = (tokens) => {
            const map = {};
            tokens.forEach(t => { map[t] = (map[t] || 0) + 1; });
            return map;
        };

        const fA = freq(tokensA);
        const fB = freq(tokensB);
        const allTerms = new Set([...tokensA, ...tokensB]);

        let dot = 0, normA = 0, normB = 0;
        allTerms.forEach(t => {
            const vA = fA[t] || 0;
            const vB = fB[t] || 0;
            dot += vA * vB;
            normA += vA * vA;
            normB += vB * vB;
        });

        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * Character n-gram overlap similarity: 2*|shared| / (|ngrams_a| + |ngrams_b|) (0-1)
     */
    function calculateNGramSimilarity(a, b, n) {
        const size = n || 2;
        const ngrams = (str) => {
            const s = standardize(str).replace(/\s+/g, '');
            const grams = [];
            for (let i = 0; i <= s.length - size; i++) grams.push(s.substring(i, i + size));
            return grams;
        };
        const gramsA = ngrams(a);
        const gramsB = ngrams(b);
        if (gramsA.length === 0 && gramsB.length === 0) return 1;
        if (gramsA.length === 0 || gramsB.length === 0) return 0;
        const setB = {};
        gramsB.forEach(g => { setB[g] = (setB[g] || 0) + 1; });
        let shared = 0;
        gramsA.forEach(g => {
            if (setB[g] > 0) { shared++; setB[g]--; }
        });
        return (2 * shared) / (gramsA.length + gramsB.length);
    }

    /**
     * Standard 4-character Soundex code for a single word
     */
    function calculateSoundex(str) {
        if (!str || typeof str !== 'string') return '0000';
        const s = str.toUpperCase().replace(/[^A-Z]/g, '');
        if (!s.length) return '0000';
        const MAP = { B:1,F:1,P:1,V:1, C:2,G:2,J:2,K:2,Q:2,S:2,X:2,Z:2,
                       D:3,T:3, L:4, M:5,N:5, R:6 };
        let code = s[0];
        let prev = MAP[s[0]] || 0;
        for (let i = 1; i < s.length && code.length < 4; i++) {
            const curr = MAP[s[i]] || 0;
            if (curr && curr !== prev) { code += curr; }
            prev = curr || prev;
        }
        return (code + '000').substring(0, 4);
    }

    /**
     * Compare Soundex codes of the first tokens; returns 1 if match, 0 otherwise
     */
    function calculateSoundexMatch(a, b) {
        const tokA = tokenize(a);
        const tokB = tokenize(b);
        if (!tokA.length || !tokB.length) return 0;
        return calculateSoundex(tokA[0]) === calculateSoundex(tokB[0]) ? 1 : 0;
    }

    /**
     * Damerau-Levenshtein distance (includes transpositions)
     */
    function calculateDamerauLevenshtein(a, b) {
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        const lenA = a.length, lenB = b.length;
        const d = Array.from({ length: lenA + 1 }, (_, i) =>
            Array.from({ length: lenB + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
        );
        for (let i = 1; i <= lenA; i++) {
            for (let j = 1; j <= lenB; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                d[i][j] = Math.min(
                    d[i - 1][j] + 1,
                    d[i][j - 1] + 1,
                    d[i - 1][j - 1] + cost
                );
                if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
                }
            }
        }
        return d[lenA][lenB];
    }

    /**
     * Jaro-Winkler similarity (0-1)
     */
    function calculateJaroWinkler(a, b) {
        if (a === b) return 1;
        if (!a.length || !b.length) return 0;
        const matchDist = Math.floor(Math.max(a.length, b.length) / 2) - 1;
        const aMatches = new Array(a.length).fill(false);
        const bMatches = new Array(b.length).fill(false);
        let matches = 0, transpositions = 0;
        for (let i = 0; i < a.length; i++) {
            const start = Math.max(0, i - matchDist);
            const end = Math.min(i + matchDist + 1, b.length);
            for (let j = start; j < end; j++) {
                if (bMatches[j] || a[i] !== b[j]) continue;
                aMatches[i] = bMatches[j] = true;
                matches++;
                break;
            }
        }
        if (matches === 0) return 0;
        let k = 0;
        for (let i = 0; i < a.length; i++) {
            if (!aMatches[i]) continue;
            while (!bMatches[k]) k++;
            if (a[i] !== b[k]) transpositions++;
            k++;
        }
        const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
        let prefix = 0;
        const maxPrefix = Math.min(4, Math.min(a.length, b.length));
        while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;
        return jaro + prefix * 0.1 * (1 - jaro);
    }

    /**
     * Haversine distance between two lat/lon points
     * Returns { miles: number, score: number } where score is 100 at same point, 0 at 50+ miles
     */
    function calculateGeoProximity(latA, lonA, latB, lonB) {
        const toRad = deg => deg * Math.PI / 180;
        const R = 3958.8; // Earth radius in miles
        const dLat = toRad(latB - latA);
        const dLon = toRad(lonB - lonA);
        const sinDLat = Math.sin(dLat / 2);
        const sinDLon = Math.sin(dLon / 2);
        const aVal = sinDLat * sinDLat + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * sinDLon * sinDLon;
        const miles = 2 * R * Math.asin(Math.sqrt(aVal));
        const score = Math.max(0, 100 - (miles / 50) * 100);
        return { miles, score };
    }

    /**
     * Detect address type from a record
     * Returns 'residential', 'commercial', 'pobox', 'military', or 'unknown'
     */
    function detectAddressType(record) {
        if (record.addressType) {
            const t = String(record.addressType).toUpperCase().trim();
            if (t === 'RESIDENTIAL' || t === 'R') return 'residential';
            if (t === 'COMMERCIAL' || t === 'C' || t === 'BUSINESS') return 'commercial';
            if (t === 'POBOX' || t === 'PO BOX' || t === 'P') return 'pobox';
            if (t === 'MILITARY' || t === 'M') return 'military';
        }
        const street = standardize(record.street || '');
        if (/\bPO\s*BOX\b/.test(street) || /\bPOBOX\b/.test(street)) return 'pobox';
        if (/\b(APO|FPO|DPO)\b/.test(street)) return 'military';
        if (/\b(STE|SUITE|DEPT|FL\s*\d|BLDG)\b/.test(street)) return 'commercial';
        if (/\b(APT|UNIT|#\d)\b/.test(street)) return 'residential';
        return 'unknown';
    }

    /**
     * Calculate record completeness as a 0-100 percentage
     * Fields: street, city, state, zip, address2, county, lat, lon,
     *         zipPlus4, carrierRoute, deliveryPoint, congressionalDistrict, addressType, vacancy
     */
    function calculateRecordCompleteness(record) {
        const fields = [
            'street', 'city', 'state', 'zip', 'address2', 'county',
            'lat', 'lon', 'zipPlus4', 'carrierRoute', 'deliveryPoint',
            'congressionalDistrict', 'addressType', 'vacancy'
        ];
        const filled = fields.filter(f => {
            const v = record[f];
            return v !== undefined && v !== null && String(v).trim() !== '';
        }).length;
        return Math.round((filled / fields.length) * 100);
    }

    /**
     * Percentage (0-100) of tokens in standardize(a) that appear in standardize(b)
     */
    function calculateTokenOverlap(a, b) {
        const tokA = tokenize(a);
        const tokB = new Set(tokenize(b));
        if (tokA.length === 0) return tokB.size === 0 ? 100 : 0;
        const hits = tokA.filter(t => tokB.has(t)).length;
        return Math.round((hits / tokA.length) * 100);
    }

    /**
     * Ensemble AI score (0-100) combining multiple similarity metrics on street fields.
     * Weights: Jaccard 20%, Jaro-Winkler 25%, n-gram 20%, Soundex 10%,
     *          token overlap 15%, Levenshtein-based 10%.
     * If both records have lat/lon, geo proximity is blended in (replaces 5% from Levenshtein weight).
     */
    function calculateCompositeAIScore(recA, recB) {
        const sA = standardize(recA.street || '');
        const sB = standardize(recB.street || '');

        const jaccard = calculateJaccardSimilarity(sA, sB) * 100;
        const jw      = calculateJaroWinkler(sA, sB) * 100;
        const ngram   = calculateNGramSimilarity(sA, sB, 2) * 100;
        const soundex = calculateSoundexMatch(sA, sB) * 100;
        const overlap = calculateTokenOverlap(sA, sB);
        const maxLen  = Math.max(sA.length, sB.length);
        const levSim  = maxLen === 0 ? 100 : (1 - calculateDamerauLevenshtein(sA, sB) / maxLen) * 100;

        const hasGeo = recA.lat != null && recA.lon != null && recB.lat != null && recB.lon != null;

        let score;
        if (hasGeo) {
            const geo = calculateGeoProximity(
                parseFloat(recA.lat), parseFloat(recA.lon),
                parseFloat(recB.lat), parseFloat(recB.lon)
            ).score;
            score = jaccard * 0.20 + jw * 0.25 + ngram * 0.20 + soundex * 0.10 +
                    overlap * 0.15 + levSim * 0.05 + geo * 0.05;
        } else {
            score = jaccard * 0.20 + jw * 0.25 + ngram * 0.20 + soundex * 0.10 +
                    overlap * 0.15 + levSim * 0.10;
        }

        return Math.min(100, Math.max(0, Math.round(score)));
    }

    /**
     * Returns a breakdown of all AI similarity scores (all values 0-100)
     */
    function getAIScoreBreakdown(recA, recB) {
        const sA = standardize(recA.street || '');
        const sB = standardize(recB.street || '');

        const maxLen = Math.max(sA.length, sB.length);
        const levSim = maxLen === 0 ? 100 : (1 - calculateDamerauLevenshtein(sA, sB) / maxLen) * 100;

        const hasGeo = recA.lat != null && recA.lon != null && recB.lat != null && recB.lon != null;
        const geoProximity = hasGeo
            ? calculateGeoProximity(
                parseFloat(recA.lat), parseFloat(recA.lon),
                parseFloat(recB.lat), parseFloat(recB.lon)
              ).score
            : null;

        return {
            jaccard:        Math.round(calculateJaccardSimilarity(sA, sB) * 100),
            jaroWinkler:    Math.round(calculateJaroWinkler(sA, sB) * 100),
            nGram:          Math.round(calculateNGramSimilarity(sA, sB, 2) * 100),
            soundex:        calculateSoundexMatch(sA, sB) * 100,
            tokenOverlap:   calculateTokenOverlap(sA, sB),
            levenshteinSim: Math.round(levSim),
            geoProximity:   geoProximity !== null ? Math.round(geoProximity) : null,
            composite:      calculateCompositeAIScore(recA, recB)
        };
    }

    return {
        standardize,
        stringSimilarity,
        normalizeZip,
        normalizeState,
        buildKey,
        calculateConfidence,
        getConfidenceLabel,
        getConfidenceBadgeClass,
        detectDiscrepancies,
        matchRecords,
        VALID_STATES,
        tokenize,
        calculateJaccardSimilarity,
        calculateCosineSimilarity,
        calculateNGramSimilarity,
        calculateSoundex,
        calculateSoundexMatch,
        calculateDamerauLevenshtein,
        calculateJaroWinkler,
        calculateGeoProximity,
        detectAddressType,
        calculateRecordCompleteness,
        calculateTokenOverlap,
        calculateCompositeAIScore,
        getAIScoreBreakdown
    };
})();
