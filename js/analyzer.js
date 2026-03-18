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

        records.forEach(rec => {
            const hasStreet = !!(rec.street && rec.street.trim());
            const hasCity   = !!(rec.city   && rec.city.trim());
            const hasState  = !!(rec.state  && rec.state.trim());
            const hasZip    = !!(rec.zip    && String(rec.zip).trim());

            const missingFields = [!hasStreet, !hasCity, !hasState, !hasZip].filter(Boolean).length;

            if (missingFields === 0) {
                completeCount++;
            } else {
                if (missingFields >= 2) multiMissing++;
                if (!hasStreet) missingStreet++;
                if (!hasCity)   missingCity++;
                if (!hasState)  missingState++;
                if (!hasZip)    missingZip++;
            }

            // Validate ZIP
            if (hasZip) {
                const z = String(rec.zip).replace(/\D/g, '');
                if (z.length !== 5 && z.length !== 9) invalidZip++;
            }

            // Validate state
            if (hasState) {
                const s = rec.state.toString().toUpperCase().trim();
                if (!AddressMatcher.VALID_STATES.has(s)) invalidState++;
            }

            // Track duplicates
            if (rec.street && rec.zip) {
                const key = AddressMatcher.standardize(rec.street) + '|' + AddressMatcher.normalizeZip(rec.zip);
                duplicates.set(key, (duplicates.get(key) || 0) + 1);
            }
        });

        const duplicateCount = Array.from(duplicates.values()).filter(v => v > 1).reduce((sum, v) => sum + (v - 1), 0);

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
            }
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
     * Run the full analysis
     */
    function runFullAnalysis(dataA, dataB, matchResults) {
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

        return {
            summary,
            quality: { a: qualityA, b: qualityB },
            geo: { stateA, stateB, cityA, cityB, zipA, zipB, geoMatch },
            cities
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
        runFullAnalysis
    };
})();
