/**
 * analyzer.js — Data Analysis Functions
 * Computes all statistics, geographic breakdowns, quality metrics, etc.
 */

const DataAnalyzer = (() => {

    const DATA_QUALITY_WEIGHTS = { completePct: 0.3, invalidZip: 0.15, duplicate: 0.15, avgCompleteness: 0.4 };
    const SCORE_AGREEMENT_THRESHOLD = 70;
    const AI_HIGH_THRESHOLD   = 80;
    const AI_MEDIUM_THRESHOLD = 50;

    /**
     * Analyze address quality for a dataset
     */
    function analyzeQuality(records) {
        const total = records.length;
        let completeCount = 0;
        let missingStreet = 0;
        let missingCity = 0;
        let missingState = 0;
        let missingZip = 0;
        let invalidZip = 0;
        let invalidState = 0;
        let multiMissing = 0;
        const duplicates = new Map();
        let totalFieldsPopulated = 0;
        let recordsWithAllFourFields = 0;
        let recordsWithSecondaryUnit = 0;
        let hasZipPlus4Count = 0;
        let standardizedStreetCount = 0;

        // New counters
        let recordsWithAddress2 = 0;
        let recordsWithCounty = 0;
        let recordsWithLatLon = 0;
        let recordsWithCarrierRoute = 0;
        let recordsWithDeliveryPoint = 0;
        let recordsWithVacancy = 0;
        let totalCompleteness = 0;
        const addressTypeCounts = { residential: 0, commercial: 0, pobox: 0, military: 0, unknown: 0 };

        // Extended field completeness counters
        let presentAddress2 = 0;
        let presentCounty = 0;
        let presentLat = 0;
        let presentLon = 0;
        let presentZipPlus4 = 0;
        let presentCarrierRoute = 0;
        let presentDeliveryPoint = 0;

        const SECONDARY_UNIT_RE = /\b(APT|APARTMENT|STE|SUITE|UNIT|#)\b/i;
        const ZIP_PLUS4_RE = /^\d{5}-?\d{4}$/;
        const USPS_ABBR_RE = /\b(ST|AVE|RD|DR|BLVD|LN|CT|CIR|PL|TER|WAY|TRL|HWY|PKWY|EXPY|BLDG|FL|DEPT|JCT|XING)\b/;

        records.forEach(rec => {
            const hasStreet = !!(rec.street && rec.street.trim());
            const hasCity   = !!(rec.city   && rec.city.trim());
            const hasState  = !!(rec.state  && rec.state.trim());
            const hasZip    = !!(rec.zip    && String(rec.zip).trim());

            const missingFields = [!hasStreet, !hasCity, !hasState, !hasZip].filter(Boolean).length;
            const fieldsPopulated = 4 - missingFields;
            totalFieldsPopulated += fieldsPopulated;

            if (missingFields === 0) {
                completeCount++;
                recordsWithAllFourFields++;
            } else {
                if (missingFields >= 2) multiMissing++;
                if (!hasStreet) missingStreet++;
                if (!hasCity)   missingCity++;
                if (!hasState)  missingState++;
                if (!hasZip)    missingZip++;
            }

            // Validate ZIP
            if (hasZip) {
                const zStr = String(rec.zip).trim();
                const z = zStr.replace(/\D/g, '');
                if (z.length !== 5 && z.length !== 9) invalidZip++;
                if (ZIP_PLUS4_RE.test(zStr) || z.length === 9) hasZipPlus4Count++;
            }

            // Validate state
            if (hasState) {
                const s = rec.state.toString().toUpperCase().trim();
                if (!AddressMatcher.VALID_STATES.has(s)) invalidState++;
            }

            // Secondary unit detection
            if (hasStreet && SECONDARY_UNIT_RE.test(rec.street)) {
                recordsWithSecondaryUnit++;
            }

            // Standardized street detection
            if (hasStreet) {
                const standardized = AddressMatcher.standardize(rec.street);
                if (USPS_ABBR_RE.test(standardized)) standardizedStreetCount++;
            }

            // Track duplicates
            if (rec.street && rec.zip) {
                const key = AddressMatcher.standardize(rec.street) + '|' + AddressMatcher.normalizeZip(rec.zip);
                duplicates.set(key, (duplicates.get(key) || 0) + 1);
            }

            // New field presence checks
            if (rec.address2 && String(rec.address2).trim()) { recordsWithAddress2++; presentAddress2++; }
            if (rec.county && String(rec.county).trim()) { recordsWithCounty++; presentCounty++; }
            if (rec.lat != null && String(rec.lat).trim() !== '' &&
                rec.lon != null && String(rec.lon).trim() !== '') {
                recordsWithLatLon++;
            }
            if (rec.lat != null && String(rec.lat).trim() !== '') presentLat++;
            if (rec.lon != null && String(rec.lon).trim() !== '') presentLon++;
            if (rec.carrierRoute && String(rec.carrierRoute).trim()) { recordsWithCarrierRoute++; presentCarrierRoute++; }
            if (rec.deliveryPoint && String(rec.deliveryPoint).trim()) { recordsWithDeliveryPoint++; presentDeliveryPoint++; }
            if (rec.vacancy) { recordsWithVacancy++; }

            // zipPlus4 field completeness (dedicated zipPlus4 field, not derived from zip)
            if (rec.zipPlus4 && String(rec.zipPlus4).trim()) presentZipPlus4++;

            // Address type distribution
            const addrType = (typeof AddressMatcher.detectAddressType === 'function')
                ? AddressMatcher.detectAddressType(rec)
                : 'unknown';
            const normalizedType = (addrType || 'unknown').toLowerCase();
            if (normalizedType in addressTypeCounts) {
                addressTypeCounts[normalizedType]++;
            } else {
                addressTypeCounts.unknown++;
            }

            // Record completeness
            const completeness = (typeof AddressMatcher.calculateRecordCompleteness === 'function')
                ? AddressMatcher.calculateRecordCompleteness(rec)
                : (fieldsPopulated / 4) * 100;
            totalCompleteness += completeness;
        });

        const duplicateCount = Array.from(duplicates.values()).filter(v => v > 1).reduce((sum, v) => sum + (v - 1), 0);
        const avgFieldsPopulated = total ? Math.round((totalFieldsPopulated / total) * 100) / 100 : 0;
        const avgCompleteness = total ? Math.round((totalCompleteness / total) * 10) / 10 : 0;

        const completePct   = total ? Math.round((completeCount / total) * 100) : 0;
        const invalidZipPct = total ? Math.round((invalidZip / total) * 1000) / 10 : 0;
        const duplicatePct  = total ? Math.round((duplicateCount / total) * 1000) / 10 : 0;

        const dataQualityScore = Math.min(100, Math.max(0,
            completePct   * DATA_QUALITY_WEIGHTS.completePct +
            (100 - invalidZipPct) * DATA_QUALITY_WEIGHTS.invalidZip +
            (100 - duplicatePct)  * DATA_QUALITY_WEIGHTS.duplicate +
            avgCompleteness       * DATA_QUALITY_WEIGHTS.avgCompleteness
        ));

        return {
            total,
            complete: completeCount,
            incomplete: total - completeCount,
            missingStreet,
            missingCity,
            missingState,
            missingZip,
            invalidZip,
            invalidState,
            multiMissing,
            duplicates: duplicateCount,
            completePct,
            fieldCompleteness: {
                street:        total ? Math.round(((total - missingStreet) / total) * 100) : 0,
                city:          total ? Math.round(((total - missingCity)   / total) * 100) : 0,
                state:         total ? Math.round(((total - missingState)  / total) * 100) : 0,
                zip:           total ? Math.round(((total - missingZip)    / total) * 100) : 0,
                address2:      total ? Math.round((presentAddress2      / total) * 100) : 0,
                county:        total ? Math.round((presentCounty        / total) * 100) : 0,
                lat:           total ? Math.round((presentLat           / total) * 100) : 0,
                lon:           total ? Math.round((presentLon           / total) * 100) : 0,
                zipPlus4:      total ? Math.round((presentZipPlus4      / total) * 100) : 0,
                carrierRoute:  total ? Math.round((presentCarrierRoute  / total) * 100) : 0,
                deliveryPoint: total ? Math.round((presentDeliveryPoint / total) * 100) : 0
            },
            // New percentage fields
            missingStreetPct:     total ? Math.round((missingStreet / total) * 1000) / 10 : 0,
            missingCityPct:       total ? Math.round((missingCity   / total) * 1000) / 10 : 0,
            missingStatePct:      total ? Math.round((missingState  / total) * 1000) / 10 : 0,
            missingZipPct:        total ? Math.round((missingZip    / total) * 1000) / 10 : 0,
            invalidZipPct,
            invalidStatePct:      total ? Math.round((invalidState  / total) * 1000) / 10 : 0,
            duplicatePct,
            avgFieldsPopulated,
            recordsWithAllFourFields,
            recordsWithSecondaryUnit,
            hasZipPlus4Count,
            recordsWithZipPlus4: hasZipPlus4Count,
            standardizedStreetPct: total ? Math.round((standardizedStreetCount / total) * 100) : 0,
            // New enriched fields
            recordsWithAddress2,
            recordsWithCounty,
            recordsWithLatLon,
            recordsWithCarrierRoute,
            recordsWithDeliveryPoint,
            recordsWithVacancy,
            addressTypeCounts,
            avgCompleteness,
            dataQualityScore: Math.round(dataQualityScore * 10) / 10
        };
    }

    /**
     * Geographic breakdown by state
     */
    function analyzeByState(records) {
        const map = new Map();
        records.forEach(rec => {
            const state = AddressMatcher.normalizeState(rec.state) || 'UNKNOWN';
            map.set(state, (map.get(state) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([state, count]) => ({ state, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Geographic breakdown by city
     */
    function analyzeByCity(records) {
        const map = new Map();
        records.forEach(rec => {
            const city = (rec.city || 'UNKNOWN').toUpperCase().trim();
            map.set(city, (map.get(city) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([city, count]) => ({ city, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Geographic breakdown by ZIP
     */
    function analyzeByZip(records) {
        const map = new Map();
        records.forEach(rec => {
            const zip = AddressMatcher.normalizeZip(rec.zip) || 'UNKNOWN';
            map.set(zip, (map.get(zip) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([zip, count]) => ({ zip, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Match summary statistics
     */
    function summarizeMatches(matchResults, dataA, dataB) {
        const { matched, unmatchedA, unmatchedB } = matchResults;
        const totalA = dataA.length;
        const totalB = dataB.length;

        // Score breakdown
        const perfect  = matched.filter(m => m.score === 100).length;
        const high     = matched.filter(m => m.score >= 90 && m.score < 100).length;
        const partial  = matched.filter(m => m.score >= 70 && m.score < 90).length;
        const low      = matched.filter(m => m.score >= 50 && m.score < 70).length;
        const veryLow  = matched.filter(m => m.score < 50).length;

        // Confidence distribution histogram (10 buckets)
        const histogram = new Array(10).fill(0);
        matched.forEach(m => {
            const bucket = Math.min(9, Math.floor(m.score / 10));
            histogram[bucket]++;
        });

        // Discrepancy type counts
        const discrepancyTypes = {};
        matched.forEach(m => {
            m.discrepancies.forEach(d => {
                discrepancyTypes[d] = (discrepancyTypes[d] || 0) + 1;
            });
        });

        const matchedCount = matched.length;
        const matchPct = totalA > 0 ? Math.round((matchedCount / totalA) * 100) : 0;

        return {
            totalA,
            totalB,
            matched: matchedCount,
            unmatchedA: unmatchedA.length,
            unmatchedB: unmatchedB.length,
            perfect,
            high,
            partial,
            low,
            veryLow,
            matchPct,
            histogram,
            discrepancyTypes
        };
    }

    /**
     * Geographic match breakdown: state-level matched/unmatched
     */
    function geoMatchBreakdown(matchResults) {
        const stateMap = new Map();

        const ensure = (state) => {
            if (!stateMap.has(state)) stateMap.set(state, { state, matched: 0, unmatchedA: 0, unmatchedB: 0 });
            return stateMap.get(state);
        };

        matchResults.matched.forEach(m => {
            const state = AddressMatcher.normalizeState(m.recordA.state) || 'UNKNOWN';
            ensure(state).matched++;
        });
        matchResults.unmatchedA.forEach(rec => {
            const state = AddressMatcher.normalizeState(rec.state) || 'UNKNOWN';
            ensure(state).unmatchedA++;
        });
        matchResults.unmatchedB.forEach(rec => {
            const state = AddressMatcher.normalizeState(rec.state) || 'UNKNOWN';
            ensure(state).unmatchedB++;
        });

        return Array.from(stateMap.values())
            .map(s => ({ ...s, total: s.matched + s.unmatchedA + s.unmatchedB }))
            .sort((a, b) => b.total - a.total);
    }

    /**
     * City-level comparison between systems
     */
    function citiesComparison(dataA, dataB) {
        const cityA = new Map();
        const cityB = new Map();

        dataA.forEach(rec => {
            const city = (rec.city || 'UNKNOWN').toUpperCase().trim();
            cityA.set(city, (cityA.get(city) || 0) + 1);
        });
        dataB.forEach(rec => {
            const city = (rec.city || 'UNKNOWN').toUpperCase().trim();
            cityB.set(city, (cityB.get(city) || 0) + 1);
        });

        const allCities = new Set([...cityA.keys(), ...cityB.keys()]);
        const result = Array.from(allCities).map(city => ({
            city,
            countA: cityA.get(city) || 0,
            countB: cityB.get(city) || 0,
            total: (cityA.get(city) || 0) + (cityB.get(city) || 0)
        })).sort((a, b) => b.total - a.total);

        return result;
    }

    /**
     * Analyze match details — per-match score statistics and breakdowns
     */
    function analyzeMatchDetails(matchResults) {
        const { matched } = matchResults;
        if (!matched || matched.length === 0) {
            return {
                avgMatchScore: 0, medianMatchScore: 0, stdDevMatchScore: 0,
                minMatchScore: 0, maxMatchScore: 0,
                scorePercentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
                avgStreetScore: 0, avgCityScore: 0, avgStateScore: 0, avgZipScore: 0,
                exactMatchCount: 0, fuzzyMatchCount: 0,
                crossStateMatchCount: 0, crossZipMatchCount: 0, crossCityMatchCount: 0,
                discrepancyRate: 0, avgDiscrepanciesPerMatch: 0, matchedWithSecondaryUnit: 0
            };
        }

        const scores = matched.map(m => m.score);
        const n = scores.length;

        // Mean
        const sum = scores.reduce((a, b) => a + b, 0);
        const avg = sum / n;

        // Sorted for percentiles/median
        const sorted = [...scores].sort((a, b) => a - b);

        function percentile(arr, p) {
            const idx = (p / 100) * (arr.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            if (lo === hi) return arr[lo];
            return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
        }

        // Std dev
        const variance = scores.reduce((acc, s) => acc + Math.pow(s - avg, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // Component score averages (use stored values if available, fall back to 0)
        const avgStreetScore = matched.reduce((a, m) => a + (m.streetScore || 0), 0) / n;
        const avgCityScore   = matched.reduce((a, m) => a + (m.cityScore   || 0), 0) / n;
        const avgStateScore  = matched.reduce((a, m) => a + (m.stateScore  || 0), 0) / n;
        const avgZipScore    = matched.reduce((a, m) => a + (m.zipScore    || 0), 0) / n;

        // Match type counts
        const exactMatchCount = matched.filter(m => m.matchType === 'exact').length;
        const fuzzyMatchCount = matched.filter(m => m.matchType === 'fuzzy').length;

        // Cross-field mismatches
        let crossStateMatchCount = 0;
        let crossZipMatchCount   = 0;
        let crossCityMatchCount  = 0;
        let totalDiscrepancies   = 0;
        let matchesWithDisc      = 0;
        let matchedWithSecondaryUnit = 0;

        const SECONDARY_UNIT_RE = /\b(APT|APARTMENT|STE|SUITE|UNIT|#)\b/i;

        matched.forEach(m => {
            const stateA = AddressMatcher.normalizeState(m.recordA.state);
            const stateB = AddressMatcher.normalizeState(m.recordB.state);
            if (stateA && stateB && stateA !== stateB) crossStateMatchCount++;

            const zipA = AddressMatcher.normalizeZip(m.recordA.zip);
            const zipB = AddressMatcher.normalizeZip(m.recordB.zip);
            if (zipA && zipB && zipA !== zipB) crossZipMatchCount++;

            const cityA = (m.recordA.city || '').toUpperCase().trim();
            const cityB = (m.recordB.city || '').toUpperCase().trim();
            if (cityA && cityB && AddressMatcher.stringSimilarity(cityA, cityB) < 1.0) crossCityMatchCount++;

            if (m.discrepancies && m.discrepancies.length > 0) {
                matchesWithDisc++;
                totalDiscrepancies += m.discrepancies.length;
            }

            if (SECONDARY_UNIT_RE.test(m.recordA.street || '') || SECONDARY_UNIT_RE.test(m.recordB.street || '')) {
                matchedWithSecondaryUnit++;
            }
        });

        return {
            avgMatchScore:    Math.round(avg * 10) / 10,
            medianMatchScore: Math.round(percentile(sorted, 50) * 10) / 10,
            stdDevMatchScore: Math.round(stdDev * 10) / 10,
            minMatchScore:    sorted[0],
            maxMatchScore:    sorted[sorted.length - 1],
            scorePercentiles: {
                p10: Math.round(percentile(sorted, 10)),
                p25: Math.round(percentile(sorted, 25)),
                p50: Math.round(percentile(sorted, 50)),
                p75: Math.round(percentile(sorted, 75)),
                p90: Math.round(percentile(sorted, 90))
            },
            avgStreetScore: Math.round(avgStreetScore * 10) / 10,
            avgCityScore:   Math.round(avgCityScore   * 10) / 10,
            avgStateScore:  Math.round(avgStateScore  * 10) / 10,
            avgZipScore:    Math.round(avgZipScore    * 10) / 10,
            exactMatchCount,
            fuzzyMatchCount,
            crossStateMatchCount,
            crossZipMatchCount,
            crossCityMatchCount,
            discrepancyRate:          n ? Math.round((matchesWithDisc / n) * 1000) / 10 : 0,
            avgDiscrepanciesPerMatch: n ? Math.round((totalDiscrepancies / n) * 100) / 100 : 0,
            matchedWithSecondaryUnit
        };
    }

    /**
     * Compute AI / ML metrics from match and quality data
     */
    function computeAIMetrics(matchResults, dataA, dataB, qualityA, qualityB, processingMs) {
        const { matched, unmatchedA, unmatchedB } = matchResults;
        const totalA = dataA.length;
        const totalB = dataB.length;
        const totalMatched = matched.length;

        // False positive estimate: matches with score < 60
        const falsePositiveEstimate = matched.filter(m => m.score < 60).length;
        const truePositiveEstimate  = totalMatched - falsePositiveEstimate;
        const precision = totalMatched > 0 ? truePositiveEstimate / totalMatched : 0;

        // Recall: matched / min(totalA, totalB)
        const recall = Math.min(totalA, totalB) > 0
            ? totalMatched / Math.min(totalA, totalB) : 0;

        // F1 Score
        const f1 = (precision + recall) > 0
            ? (2 * precision * recall) / (precision + recall) : 0;

        // Accuracy: high-confidence fraction
        const perfectMatches = matched.filter(m => m.score === 100).length;
        const highMatches    = matched.filter(m => m.score >= 90).length;
        const accuracy = totalMatched > 0 ? highMatches / totalMatched : 0;

        // Jaccard Index
        const jaccard = (totalA + totalB - totalMatched) > 0
            ? totalMatched / (totalA + totalB - totalMatched) : 0;

        // Data Quality Score composite
        function dqScore(q) {
            const completePct     = q.completePct || 0;
            const invalidZipPct   = q.invalidZipPct || 0;
            const duplicatePct    = q.duplicatePct  || 0;
            const avgFields       = q.avgFieldsPopulated != null ? q.avgFieldsPopulated : 4;
            return (completePct * 0.4) +
                   ((100 - invalidZipPct) * 0.2) +
                   ((100 - duplicatePct) * 0.2) +
                   ((avgFields / 4) * 100 * 0.2);
        }
        const dqScoreA = Math.round(dqScore(qualityA) * 10) / 10;
        const dqScoreB = Math.round(dqScore(qualityB) * 10) / 10;

        // Match percentage
        const matchPct = totalA > 0 ? (totalMatched / totalA) * 100 : 0;

        // Average match score
        const avgMatchScore = totalMatched > 0
            ? matched.reduce((a, m) => a + m.score, 0) / totalMatched : 0;

        // Overall Confidence Index
        const overallConfidence = Math.round(
            (avgMatchScore * 0.4 + matchPct * 0.3 + ((dqScoreA + dqScoreB) / 2) * 0.3) * 10
        ) / 10;

        // Shannon Entropy of histogram (10 buckets)
        const histogram = new Array(10).fill(0);
        matched.forEach(m => {
            const bucket = Math.min(9, Math.floor(m.score / 10));
            histogram[bucket]++;
        });
        let entropy = 0;
        if (totalMatched > 0) {
            histogram.forEach(count => {
                if (count > 0) {
                    const p = count / totalMatched;
                    entropy -= p * Math.log2(p);
                }
            });
        }

        // Gini Coefficient of score distribution (capped sample for O(n²) performance)
        let gini = 0;
        if (totalMatched > 1) {
            const sortedScores = [...matched.map(m => m.score)].sort((a, b) => a - b);
            const sampleSize = Math.min(totalMatched, 500);
            const sample = sortedScores.slice(0, sampleSize);
            let sampleDiff = 0;
            for (let i = 0; i < sample.length; i++) {
                for (let j = 0; j < sample.length; j++) {
                    sampleDiff += Math.abs(sample[i] - sample[j]);
                }
            }
            const sampleMean = sample.reduce((a, b) => a + b, 0) / sample.length;
            gini = sampleMean > 0 ? sampleDiff / (2 * sample.length * sample.length * sampleMean) : 0;
        }

        // Coverage rates
        const coverageRateA = totalA > 0 ? ((totalMatched + unmatchedA.length) / totalA) * 100 : 0;
        const coverageRateB = totalB > 0 ? ((totalMatched + unmatchedB.length) / totalB) * 100 : 0;

        // False positive risk: borderline matches (threshold to threshold+10)
        const threshold = 70; // default
        const borderlineMatches = matched.filter(m => m.score >= threshold && m.score < threshold + 10).length;
        const falsePositiveRisk = totalMatched > 0 ? Math.round((borderlineMatches / totalMatched) * 1000) / 10 : 0;

        // Anomaly rate: duplicates or invalid zip/state records
        const anomalyA = (qualityA.duplicates || 0) + (qualityA.invalidZip || 0) + (qualityA.invalidState || 0);
        const anomalyB = (qualityB.duplicates || 0) + (qualityB.invalidZip || 0) + (qualityB.invalidState || 0);
        const totalRecords = totalA + totalB;
        const anomalyRate = totalRecords > 0 ? Math.round(((anomalyA + anomalyB) / totalRecords) * 1000) / 10 : 0;

        // Cosine Similarity Proxy — state frequency vectors
        const statesAll = new Set([...dataA.map(r => AddressMatcher.normalizeState(r.state)), ...dataB.map(r => AddressMatcher.normalizeState(r.state))]);
        const vecA = {}, vecB = {};
        statesAll.forEach(s => { vecA[s] = 0; vecB[s] = 0; });
        dataA.forEach(r => { const s = AddressMatcher.normalizeState(r.state); if (s) vecA[s] = (vecA[s] || 0) + 1; });
        dataB.forEach(r => { const s = AddressMatcher.normalizeState(r.state); if (s) vecB[s] = (vecB[s] || 0) + 1; });
        let dot = 0, magA = 0, magB = 0;
        statesAll.forEach(s => {
            dot  += (vecA[s] || 0) * (vecB[s] || 0);
            magA += Math.pow(vecA[s] || 0, 2);
            magB += Math.pow(vecB[s] || 0, 2);
        });
        const cosineSimilarity = (magA > 0 && magB > 0) ? Math.round((dot / (Math.sqrt(magA) * Math.sqrt(magB))) * 1000) / 10 : 0;

        // Processing efficiency
        const processingEfficiency = (processingMs && processingMs > 0 && totalA > 0)
            ? Math.round((totalA / (processingMs / 1000)) * 10) / 10 : 0;

        // Model confidence band from percentiles
        const sortedFinal = [...matched.map(m => m.score)].sort((a, b) => a - b);
        function pct(arr, p) {
            if (!arr.length) return 0;
            const idx = (p / 100) * (arr.length - 1);
            const lo = Math.floor(idx); const hi = Math.ceil(idx);
            if (lo === hi) return arr[lo];
            return Math.round(arr[lo] + (arr[hi] - arr[lo]) * (idx - lo));
        }
        const modelConfidenceBand = {
            lower: pct(sortedFinal, 10),
            mid:   pct(sortedFinal, 50),
            upper: pct(sortedFinal, 90)
        };

        return {
            precision:           Math.round(precision * 1000) / 10,
            recall:              Math.round(recall    * 1000) / 10,
            f1Score:             Math.round(f1        * 1000) / 10,
            accuracy:            Math.round(accuracy  * 1000) / 10,
            jaccardIndex:        Math.round(jaccard   * 1000) / 10,
            dqScoreA,
            dqScoreB,
            overallConfidence,
            entropy:             Math.round(entropy * 100) / 100,
            giniCoefficient:     Math.round(gini    * 1000) / 1000,
            coverageRateA:       Math.round(coverageRateA * 10) / 10,
            coverageRateB:       Math.round(coverageRateB * 10) / 10,
            falsePositiveRisk,
            anomalyRate,
            cosineSimilarity,
            processingEfficiency,
            modelConfidenceBand
        };
    }

    /**
     * Compute detailed AI/ML scoring metrics from match results
     */
    function analyzeAIMetrics(matchResults) {
        const matched = (matchResults && matchResults.matched) ? matchResults.matched : [];
        const n = matched.length;

        if (n === 0) {
            return {
                avgAIScore: 0, aiScoreHistogram: new Array(20).fill(0),
                avgJaccard: 0, avgJaroWinkler: 0, avgNGram: 0, avgSoundex: 0,
                avgTokenOverlap: 0, avgLevenshteinSim: 0, avgGeoProximity: 0,
                aiVsTraditionalCorrelation: 0, scoreAgreementRate: 0,
                aiHighCount: 0, aiMediumCount: 0, aiLowCount: 0,
                aiConfidenceDistribution: { high: 0, medium: 0, low: 0 },
                f1Equivalent: 0
            };
        }

        // Average AI score
        let totalAI = 0;
        matched.forEach(m => { totalAI += (m.aiScore || 0); });
        const avgAIScore = Math.round((totalAI / n) * 10) / 10;

        // 20-bucket histogram (0-4, 5-9, ..., 95-100)
        const aiScoreHistogram = new Array(20).fill(0);
        matched.forEach(m => {
            const score = m.aiScore || 0;
            const bucket = Math.min(19, Math.floor(score / 5));
            aiScoreHistogram[bucket]++;
        });

        // Breakdown averages (from aiScoreBreakdown)
        let sumJaccard = 0, sumJaro = 0, sumNGram = 0, sumSoundex = 0;
        let sumToken = 0, sumLevenshtein = 0, sumGeoProx = 0;
        matched.forEach(m => {
            const bd = m.aiScoreBreakdown || {};
            sumJaccard      += bd.jaccard          || 0;
            sumJaro         += bd.jaroWinkler       || 0;
            sumNGram        += bd.nGram             || 0;
            sumSoundex      += bd.soundex           || 0;
            sumToken        += bd.tokenOverlap      || 0;
            sumLevenshtein  += bd.levenshteinSim    || 0;
            sumGeoProx      += bd.geoProximity      || 0;
        });
        const avgJaccard        = Math.round((sumJaccard     / n) * 1000) / 1000;
        const avgJaroWinkler    = Math.round((sumJaro        / n) * 1000) / 1000;
        const avgNGram          = Math.round((sumNGram       / n) * 1000) / 1000;
        const avgSoundex        = Math.round((sumSoundex     / n) * 1000) / 1000;
        const avgTokenOverlap   = Math.round((sumToken       / n) * 1000) / 1000;
        const avgLevenshteinSim = Math.round((sumLevenshtein / n) * 1000) / 1000;
        const avgGeoProximity   = Math.round((sumGeoProx     / n) * 1000) / 1000;

        // Pearson correlation between aiScore and traditional score
        let aiVsTraditionalCorrelation = 0;
        if (n >= 2) {
            const aiScores   = matched.map(m => m.aiScore || 0);
            const tradScores = matched.map(m => m.score   || 0);
            const meanAI   = aiScores.reduce((a, b) => a + b, 0) / n;
            const meanTrad = tradScores.reduce((a, b) => a + b, 0) / n;
            let cov = 0, varAI = 0, varTrad = 0;
            for (let i = 0; i < n; i++) {
                const dA = aiScores[i]   - meanAI;
                const dT = tradScores[i] - meanTrad;
                cov     += dA * dT;
                varAI   += dA * dA;
                varTrad += dT * dT;
            }
            const denom = Math.sqrt(varAI * varTrad);
            aiVsTraditionalCorrelation = denom > 0 ? Math.round((cov / denom) * 1000) / 1000 : 0;
        }

        // Agreement rate: both >= threshold OR both < threshold
        let agreementCount = 0;
        matched.forEach(m => {
            const ai   = m.aiScore || 0;
            const trad = m.score   || 0;
            if ((ai >= SCORE_AGREEMENT_THRESHOLD && trad >= SCORE_AGREEMENT_THRESHOLD) ||
                (ai < SCORE_AGREEMENT_THRESHOLD && trad < SCORE_AGREEMENT_THRESHOLD)) agreementCount++;
        });
        const scoreAgreementRate = Math.round((agreementCount / n) * 1000) / 10;

        // Confidence buckets
        const aiHighCount   = matched.filter(m => (m.aiScore || 0) >= AI_HIGH_THRESHOLD).length;
        const aiMediumCount = matched.filter(m => (m.aiScore || 0) >= AI_MEDIUM_THRESHOLD && (m.aiScore || 0) < AI_HIGH_THRESHOLD).length;
        const aiLowCount    = matched.filter(m => (m.aiScore || 0) < AI_MEDIUM_THRESHOLD).length;

        const aiConfidenceDistribution = { high: aiHighCount, medium: aiMediumCount, low: aiLowCount };

        // F1 equivalent
        const aiHighPct     = (aiHighCount / n) * 100;
        const agreementRate = scoreAgreementRate;
        let f1Equivalent = 0;
        const f1Denom = (aiHighPct / 100) + (agreementRate / 100);
        if (f1Denom > 0) {
            f1Equivalent = Math.round(
                (2 * (aiHighPct / 100) * (agreementRate / 100)) / f1Denom * 1000
            ) / 10;
        }

        return {
            avgAIScore,
            aiScoreHistogram,
            avgJaccard,
            avgJaroWinkler,
            avgNGram,
            avgSoundex,
            avgTokenOverlap,
            avgLevenshteinSim,
            avgGeoProximity,
            aiVsTraditionalCorrelation,
            scoreAgreementRate,
            aiHighCount,
            aiMediumCount,
            aiLowCount,
            aiConfidenceDistribution,
            f1Equivalent
        };
    }

    /**
     * Analyze geographic distance metrics from match results
     */
    function analyzeGeoMetrics(matchResults) {
        const matched = (matchResults && matchResults.matched) ? matchResults.matched : [];

        const withGeo = matched.filter(m => typeof m.geoDistance === 'number');
        const matchesWithGeoData = withGeo.length;

        if (matchesWithGeoData === 0) {
            return {
                avgGeoDistance: 0,
                matchesWithin_01mi: 0,
                matchesWithin_1mi: 0,
                matchesWithin_5mi: 0,
                matchesBeyond_10mi: 0,
                geoMismatchRate: 0,
                matchesWithGeoData: 0
            };
        }

        let totalDist = 0;
        let within01 = 0, within1 = 0, within5 = 0, beyond10 = 0, beyond5 = 0;

        withGeo.forEach(m => {
            const d = m.geoDistance;
            totalDist += d;
            if (d < 0.1)  within01++;
            if (d < 1)    within1++;
            if (d < 5)    within5++;
            if (d >= 10)  beyond10++;
            if (d > 5)    beyond5++;
        });

        const avgGeoDistance  = Math.round((totalDist / matchesWithGeoData) * 1000) / 1000;
        const geoMismatchRate = Math.round((beyond5 / matchesWithGeoData) * 1000) / 10;

        return {
            avgGeoDistance,
            matchesWithin_01mi:   within01,
            matchesWithin_1mi:    within1,
            matchesWithin_5mi:    within5,
            matchesBeyond_10mi:   beyond10,
            geoMismatchRate,
            matchesWithGeoData
        };
    }

    /**
     * Analyze address type distribution and match rates
     */
    function analyzeAddressTypeMetrics(matchResults) {
        const matched   = (matchResults && matchResults.matched)   ? matchResults.matched   : [];
        const unmatchedA = (matchResults && matchResults.unmatchedA) ? matchResults.unmatchedA : [];

        const types = ['residential', 'commercial', 'pobox', 'military', 'unknown'];
        const totals   = {};
        const matchedByType = {};
        types.forEach(t => { totals[t] = 0; matchedByType[t] = 0; });

        // Count totals from matched recordA + unmatchedA
        const allA = matched.map(m => m.recordA).concat(unmatchedA);
        allA.forEach(rec => {
            const type = (typeof AddressMatcher.detectAddressType === 'function')
                ? (AddressMatcher.detectAddressType(rec) || 'unknown').toLowerCase()
                : 'unknown';
            const key = types.includes(type) ? type : 'unknown';
            totals[key]++;
        });

        // Count matched by type
        let typeMismatchCount = 0;
        matched.forEach(m => {
            const typeA = (typeof AddressMatcher.detectAddressType === 'function')
                ? (AddressMatcher.detectAddressType(m.recordA) || 'unknown').toLowerCase()
                : 'unknown';
            const typeB = (typeof AddressMatcher.detectAddressType === 'function')
                ? (AddressMatcher.detectAddressType(m.recordB) || 'unknown').toLowerCase()
                : 'unknown';
            const keyA = types.includes(typeA) ? typeA : 'unknown';
            matchedByType[keyA]++;
            if (typeA !== typeB) typeMismatchCount++;
        });

        const matchRateByType = {};
        types.forEach(t => {
            const total   = totals[t];
            const matchedN = matchedByType[t];
            matchRateByType[t] = {
                matched: matchedN,
                total,
                rate: total > 0 ? Math.round((matchedN / total) * 1000) / 10 : 0
            };
        });

        const typeMismatchRate = matched.length > 0
            ? Math.round((typeMismatchCount / matched.length) * 1000) / 10
            : 0;

        return { matchRateByType, typeMismatchCount, typeMismatchRate };
    }

    /**
     * Analyze which scoring fields contribute most to match scores
     */
    function analyzeFieldContribution(matchResults) {
        const matched = (matchResults && matchResults.matched) ? matchResults.matched : [];
        const n = matched.length;

        const fields = ['street', 'city', 'state', 'zip'];
        const scoreKey = { street: 'streetScore', city: 'cityScore', state: 'stateScore', zip: 'zipScore' };

        if (n === 0) {
            return {
                fieldImportance: fields.map(f => ({ field: f, avgComponentScore: 0, matchCountAbove70: 0 })),
                topContributingField: 'street'
            };
        }

        const fieldImportance = fields.map(field => {
            const key = scoreKey[field];
            let total = 0;
            let above70 = 0;
            matched.forEach(m => {
                const s = m[key] || 0;
                total += s;
                if (s >= 70) above70++;
            });
            return {
                field,
                avgComponentScore: Math.round((total / n) * 10) / 10,
                matchCountAbove70: above70
            };
        }).sort((a, b) => b.avgComponentScore - a.avgComponentScore);

        const topContributingField = fieldImportance[0] ? fieldImportance[0].field : 'street';

        return { fieldImportance, topContributingField };
    }

    /**
     * Analyze patterns in address discrepancies across matched records
     */
    function analyzeDiscrepancyPatterns(matchResults) {
        const matched = (matchResults && matchResults.matched) ? matchResults.matched : [];

        const comboMap = {};
        let totalDiscrepancies = 0;
        let noDiscrepancies = 0;
        let multipleDiscrepancies = 0;
        const discrepancyTotals = {};

        matched.forEach(m => {
            const discs = m.discrepancies || [];
            const count = discs.length;
            totalDiscrepancies += count;
            if (count === 0) noDiscrepancies++;
            if (count >= 2)  multipleDiscrepancies++;

            // Individual discrepancy type counts
            discs.forEach(d => {
                discrepancyTotals[d] = (discrepancyTotals[d] || 0) + 1;
            });

            // Combo string (sorted for determinism)
            if (count > 0) {
                const combo = [...discs].sort().join(' + ');
                comboMap[combo] = (comboMap[combo] || 0) + 1;
            }
        });

        // Top 10 combos
        const comboFrequency = Object.fromEntries(
            Object.entries(comboMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
        );

        // Most common single discrepancy
        let mostCommonDiscrepancy = null;
        let maxCount = 0;
        Object.entries(discrepancyTotals).forEach(([d, cnt]) => {
            if (cnt > maxCount) { maxCount = cnt; mostCommonDiscrepancy = d; }
        });

        const n = matched.length;
        const avgDiscrepancySeverity = n > 0
            ? Math.round((totalDiscrepancies / n) * 100) / 100
            : 0;

        return {
            comboFrequency,
            avgDiscrepancySeverity,
            mostCommonDiscrepancy,
            recordsWithNoDiscrepancies: noDiscrepancies,
            recordsWithMultipleDiscrepancies: multipleDiscrepancies
        };
    }

    /**
     * Run the full analysis
     * @param {Array} dataA
     * @param {Array} dataB
     * @param {Object} matchResults
     * @param {number} [processingMs] - milliseconds taken for matching (for efficiency metric)
     */
    function runFullAnalysis(dataA, dataB, matchResults, processingMs) {
        const summary       = summarizeMatches(matchResults, dataA, dataB);
        const qualityA      = analyzeQuality(dataA);
        const qualityB      = analyzeQuality(dataB);
        const stateA        = analyzeByState(dataA);
        const stateB        = analyzeByState(dataB);
        const cityA         = analyzeByCity(dataA);
        const cityB         = analyzeByCity(dataB);
        const zipA          = analyzeByZip(dataA);
        const zipB          = analyzeByZip(dataB);
        const geoMatch      = geoMatchBreakdown(matchResults);
        const cities        = citiesComparison(dataA, dataB);
        const matchDetails  = analyzeMatchDetails(matchResults);
        const aiMetrics     = computeAIMetrics(matchResults, dataA, dataB, qualityA, qualityB, processingMs);
        const extendedAIMetrics  = analyzeAIMetrics(matchResults);
        const geoMetrics         = analyzeGeoMetrics(matchResults);
        const addressTypes       = analyzeAddressTypeMetrics(matchResults);
        const fieldContribution  = analyzeFieldContribution(matchResults);
        const discrepancyPatterns = analyzeDiscrepancyPatterns(matchResults);

        return {
            summary,
            quality: { a: qualityA, b: qualityB },
            geo: { stateA, stateB, cityA, cityB, zipA, zipB, geoMatch },
            cities,
            matchDetails,
            aiMetrics,
            extendedAIMetrics,
            geoMetrics,
            addressTypes,
            fieldContribution,
            discrepancyPatterns
        };
    }

    return {
        analyzeQuality,
        analyzeByState,
        analyzeByCity,
        analyzeByZip,
        summarizeMatches,
        geoMatchBreakdown,
        citiesComparison,
        analyzeMatchDetails,
        computeAIMetrics,
        analyzeAIMetrics,
        analyzeGeoMetrics,
        analyzeAddressTypeMetrics,
        analyzeFieldContribution,
        analyzeDiscrepancyPatterns,
        runFullAnalysis
    };
})();
