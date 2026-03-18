/**
 * matcher.js — Address Matching Engine (ES Module)
 * Ported from the IIFE version in js/matcher.js
 */

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
export const VALID_STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP'
]);

export function standardize(str) {
    if (!str || typeof str !== 'string') return '';
    let s = str.toUpperCase().trim();
    s = s.replace(/[^A-Z0-9\s#\-]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    Object.entries(STREET_ABBR).forEach(([full, abbr]) => {
        const regex = new RegExp(`\\b${full}\\b`, 'g');
        s = s.replace(regex, abbr);
    });
    return s;
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const maxLen = Math.max(a.length, b.length);
    if (Math.abs(a.length - b.length) / maxLen > 0.6) return maxLen;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
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

export function stringSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const sa = standardize(a);
    const sb = standardize(b);
    if (sa === sb) return 1;
    const dist = levenshtein(sa, sb);
    const maxLen = Math.max(sa.length, sb.length);
    return maxLen === 0 ? 1 : 1 - (dist / maxLen);
}

export function normalizeZip(zip) {
    if (!zip) return '';
    const s = String(zip).replace(/\D/g, '');
    return s.substring(0, 5);
}

export function normalizeState(state) {
    if (!state) return '';
    return state.toString().toUpperCase().trim().substring(0, 2);
}

export function buildKey(record) {
    const street = standardize(record.street || '');
    const city = (record.city || '').toUpperCase().trim();
    const state = normalizeState(record.state);
    const zip = normalizeZip(record.zip);
    return `${street}|${city}|${state}|${zip}`;
}

function buildZipKey(record) {
    return normalizeZip(record.zip) + '|' + normalizeState(record.state);
}

export function calculateConfidence(recA, recB, weights) {
    const w = weights || { zip: 40, state: 30, city: 20, street: 10 };

    const zipA = normalizeZip(recA.zip);
    const zipB = normalizeZip(recB.zip);
    let zipScore = 0;
    if (zipA && zipB) {
        zipScore = zipA === zipB ? 100 : (zipA.substring(0, 3) === zipB.substring(0, 3) ? 50 : 0);
    } else if (!zipA && !zipB) {
        zipScore = 50;
    }

    const stateA = normalizeState(recA.state);
    const stateB = normalizeState(recB.state);
    let stateScore = 0;
    if (stateA && stateB) {
        stateScore = stateA === stateB ? 100 : 0;
    } else if (!stateA && !stateB) {
        stateScore = 50;
    }

    const cityA = (recA.city || '').toUpperCase().trim();
    const cityB = (recB.city || '').toUpperCase().trim();
    let cityScore = 0;
    if (cityA || cityB) {
        cityScore = Math.round(stringSimilarity(cityA, cityB) * 100);
    } else {
        cityScore = 50;
    }

    const streetA = standardize(recA.street || '');
    const streetB = standardize(recB.street || '');
    let streetScore = 0;
    if (streetA || streetB) {
        streetScore = Math.round(stringSimilarity(streetA, streetB) * 100);
    } else {
        streetScore = 50;
    }

    const score = Math.round(
        (zipScore * w.zip + stateScore * w.state + cityScore * w.city + streetScore * w.street) / 100
    );

    return {
        score: Math.min(100, Math.max(0, score)),
        zipScore,
        stateScore,
        cityScore,
        streetScore
    };
}

export function getConfidenceLabel(score) {
    if (score === 100) return 'perfect';
    if (score >= 90) return 'high';
    if (score >= 70) return 'partial';
    if (score >= 50) return 'low';
    return 'none';
}

export function getConfidenceBadgeClass(score) {
    return 'badge-' + getConfidenceLabel(score);
}

export function detectDiscrepancies(recA, recB) {
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

export function matchRecords(dataA, dataB, options = {}) {
    const threshold = options.threshold || 70;
    const weights = options.weights || { zip: 40, state: 30, city: 20, street: 10 };
    const onProgress = options.onProgress || (() => {});

    const matched = [];
    const unmatchedA = [];
    const matchedBIndices = new Set();

    const exactMap = new Map();
    const zipStateMap = new Map();

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

        if (i % 500 === 0) onProgress(i, total);

        if (exactMap.has(keyA)) {
            const bIdx = exactMap.get(keyA);
            if (!matchedBIndices.has(bIdx)) {
                matchedBIndices.add(bIdx);
                const discrepancies = detectDiscrepancies(recA, dataB[bIdx]);
                matched.push({
                    recordA: recA,
                    recordB: dataB[bIdx],
                    score: 100,
                    label: 'perfect',
                    discrepancies,
                    zipScore: 100,
                    stateScore: 100,
                    cityScore: 100,
                    streetScore: 100,
                    matchType: 'exact'
                });
                continue;
            }
        }

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
            if (bestScore === 100) break;
        }

        if (bestScore < threshold && candidates.length === 0) {
            const stateKey = normalizeState(recA.state);
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
            matchedBIndices.add(bestBIdx);
            const discrepancies = detectDiscrepancies(recA, dataB[bestBIdx]);
            matched.push({
                recordA: recA,
                recordB: dataB[bestBIdx],
                score: bestScore,
                label: getConfidenceLabel(bestScore),
                discrepancies,
                zipScore: bestResult ? bestResult.zipScore : 0,
                stateScore: bestResult ? bestResult.stateScore : 0,
                cityScore: bestResult ? bestResult.cityScore : 0,
                streetScore: bestResult ? bestResult.streetScore : 0,
                matchType: 'fuzzy'
            });
        } else {
            unmatchedA.push(recA);
        }
    }

    onProgress(total, total);

    const unmatchedB = dataB.filter((_, idx) => !matchedBIndices.has(idx));

    return { matched, unmatchedA, unmatchedB };
}

const AddressMatcher = {
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
    VALID_STATES
};

export default AddressMatcher;
