/**
 * analyzer.js — Data Analysis Functions
 * Computes all statistics, geographic breakdowns, quality metrics, etc.
 */

const DataAnalyzer = (() => {

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
        });

        const duplicateCount = Array.from(duplicates.values()).filter(v => v > 1).reduce((sum, v) => sum + (v - 1), 0);
        const avgFieldsPopulated = total ? Math.round((totalFieldsPopulated / total) * 100) / 100 : 0;

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
            completePct: total ? Math.round((completeCount / total) * 100) : 0,
            fieldCompleteness: {
                street: total ? Math.round(((total - missingStreet) / total) * 100) : 0,
                city:   total ? Math.round(((total - missingCity)   / total) * 100) : 0,
                state:  total ? Math.round(((total - missingState)  / total) * 100) : 0,
                zip:    total ? Math.round(((total - missingZip)    / total) * 100) : 0
            },
            // New percentage fields
            missingStreetPct:     total ? Math.round((missingStreet / total) * 1000) / 10 : 0,
            missingCityPct:       total ? Math.round((missingCity   / total) * 1000) / 10 : 0,
            missingStatePct:      total ? Math.round((missingState  / total) * 1000) / 10 : 0,
            missingZipPct:        total ? Math.round((missingZip    / total) * 1000) / 10 : 0,
            invalidZipPct:        total ? Math.round((invalidZip    / total) * 1000) / 10 : 0,
            invalidStatePct:      total ? Math.round((invalidState  / total) * 1000) / 10 : 0,
            duplicatePct:         total ? Math.round((duplicateCount / total) * 1000) / 10 : 0,
            avgFieldsPopulated,
            recordsWithAllFourFields,
            recordsWithSecondaryUnit,
            hasZipPlus4Count,
            standardizedStreetPct: total ? Math.round((standardizedStreetCount / total) * 100) : 0
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
        const precision = (totalMatched + falsePositiveEstimate) > 0
            ? totalMatched / (totalMatched + falsePositiveEstimate) : 0;

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

        // Gini Coefficient of score distribution
        let gini = 0;
        if (totalMatched > 1) {
            const sortedScores = [...matched.map(m => m.score)].sort((a, b) => a - b);
            let sumOfAbsDiffs = 0;
            const mean = avgMatchScore;
            for (let i = 0; i < sortedScores.length; i++) {
                for (let j = 0; j < sortedScores.length; j++) {
                    sumOfAbsDiffs += Math.abs(sortedScores[i] - sortedScores[j]);
                }
            }
            // Cap at 500 pairs for performance
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

        return {
            summary,
            quality: { a: qualityA, b: qualityB },
            geo: { stateA, stateB, cityA, cityB, zipA, zipB, geoMatch },
            cities,
            matchDetails,
            aiMetrics
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
        runFullAnalysis
    };
})();
