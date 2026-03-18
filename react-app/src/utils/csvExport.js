function downloadCsv(rows, filename) {
    const csv = rows.map(r =>
        r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportMatchedCsv(matchResults) {
    if (!matchResults) return;
    const rows = [['Score', 'Street_A', 'City_A', 'State_A', 'ZIP_A', 'Street_B', 'City_B', 'State_B', 'ZIP_B', 'Discrepancies']];
    matchResults.matched.forEach(m => {
        rows.push([
            m.score, m.recordA.street, m.recordA.city, m.recordA.state, m.recordA.zip,
            m.recordB.street, m.recordB.city, m.recordB.state, m.recordB.zip,
            m.discrepancies.join('; ')
        ]);
    });
    downloadCsv(rows, 'matched_records.csv');
}

export function exportUnmatchedACsv(matchResults) {
    if (!matchResults) return;
    const rows = [['Street', 'City', 'State', 'ZIP'],
        ...matchResults.unmatchedA.map(r => [r.street, r.city, r.state, r.zip])];
    downloadCsv(rows, 'unmatched_system_a.csv');
}

export function exportUnmatchedBCsv(matchResults) {
    if (!matchResults) return;
    const rows = [['Street', 'City', 'State', 'ZIP'],
        ...matchResults.unmatchedB.map(r => [r.street, r.city, r.state, r.zip])];
    downloadCsv(rows, 'unmatched_system_b.csv');
}

export function exportSummaryCsv(analysis) {
    if (!analysis) return;
    const { summary, quality, matchDetails, aiMetrics } = analysis;
    const rows = [
        ['Metric', 'Value'],
        ['Total Records System A', summary.totalA],
        ['Total Records System B', summary.totalB],
        ['Matched Records', summary.matched],
        ['Match Rate', summary.matchPct + '%'],
        ['Perfect Matches (100%)', summary.perfect],
        ['High Confidence (90-99%)', summary.high],
        ['Partial Matches (70-89%)', summary.partial],
        ['Low Confidence (50-69%)', summary.low],
        ['No Match (<50%)', summary.veryLow],
        ['Unmatched in System A', summary.unmatchedA],
        ['Unmatched in System B', summary.unmatchedB],
        [''],
        ['Address Quality - System A', ''],
        ['Complete Addresses', quality.a.complete],
        ['Incomplete Addresses', quality.a.incomplete],
        ['Invalid ZIP Codes', quality.a.invalidZip],
        ['Duplicate Addresses', quality.a.duplicates],
        ['Avg Fields Populated', quality.a.avgFieldsPopulated],
        ['Records w/ Secondary Unit (APT/STE)', quality.a.recordsWithSecondaryUnit],
        ['ZIP+4 Count', quality.a.hasZipPlus4Count],
        ['Standardized Street %', quality.a.standardizedStreetPct + '%'],
        [''],
        ['Address Quality - System B', ''],
        ['Complete Addresses', quality.b.complete],
        ['Incomplete Addresses', quality.b.incomplete],
        ['Invalid ZIP Codes', quality.b.invalidZip],
        ['Duplicate Addresses', quality.b.duplicates],
        ['Avg Fields Populated', quality.b.avgFieldsPopulated],
        ['Records w/ Secondary Unit (APT/STE)', quality.b.recordsWithSecondaryUnit],
        ['ZIP+4 Count', quality.b.hasZipPlus4Count],
        ['Standardized Street %', quality.b.standardizedStreetPct + '%'],
    ];
    if (matchDetails) {
        rows.push(['']);
        rows.push(['Match Score Statistics', '']);
        rows.push(['Average Match Score', matchDetails.avgMatchScore + '%']);
        rows.push(['Median Match Score', matchDetails.medianMatchScore + '%']);
        rows.push(['Std Dev Match Score', matchDetails.stdDevMatchScore]);
        rows.push(['Min Match Score', matchDetails.minMatchScore + '%']);
        rows.push(['Max Match Score', matchDetails.maxMatchScore + '%']);
        rows.push(['P10 Score', matchDetails.scorePercentiles.p10 + '%']);
        rows.push(['P25 Score', matchDetails.scorePercentiles.p25 + '%']);
        rows.push(['P50 Score', matchDetails.scorePercentiles.p50 + '%']);
        rows.push(['P75 Score', matchDetails.scorePercentiles.p75 + '%']);
        rows.push(['P90 Score', matchDetails.scorePercentiles.p90 + '%']);
        rows.push(['Avg Street Component Score', matchDetails.avgStreetScore + '%']);
        rows.push(['Avg City Component Score', matchDetails.avgCityScore + '%']);
        rows.push(['Avg State Component Score', matchDetails.avgStateScore + '%']);
        rows.push(['Avg ZIP Component Score', matchDetails.avgZipScore + '%']);
        rows.push(['Exact Matches', matchDetails.exactMatchCount]);
        rows.push(['Fuzzy Matches', matchDetails.fuzzyMatchCount]);
        rows.push(['Cross-State Matches', matchDetails.crossStateMatchCount]);
        rows.push(['Cross-ZIP Matches', matchDetails.crossZipMatchCount]);
        rows.push(['Cross-City Matches', matchDetails.crossCityMatchCount]);
        rows.push(['Discrepancy Rate', matchDetails.discrepancyRate + '%']);
        rows.push(['Avg Discrepancies/Match', matchDetails.avgDiscrepanciesPerMatch]);
        rows.push(['Matched w/ Secondary Unit', matchDetails.matchedWithSecondaryUnit]);
    }
    if (aiMetrics) {
        rows.push(['']);
        rows.push(['AI / ML Metrics', '']);
        rows.push(['Precision', aiMetrics.precision + '%']);
        rows.push(['Recall', aiMetrics.recall + '%']);
        rows.push(['F1 Score', aiMetrics.f1Score + '%']);
        rows.push(['Accuracy', aiMetrics.accuracy + '%']);
        rows.push(['Jaccard Index', aiMetrics.jaccardIndex + '%']);
        rows.push(['DQ Score System A', aiMetrics.dqScoreA + '%']);
        rows.push(['DQ Score System B', aiMetrics.dqScoreB + '%']);
        rows.push(['Overall Confidence Index', aiMetrics.overallConfidence + '%']);
        rows.push(['Shannon Entropy', aiMetrics.entropy]);
        rows.push(['Gini Coefficient', aiMetrics.giniCoefficient]);
        rows.push(['Coverage Rate A', aiMetrics.coverageRateA + '%']);
        rows.push(['Coverage Rate B', aiMetrics.coverageRateB + '%']);
        rows.push(['False Positive Risk', aiMetrics.falsePositiveRisk + '%']);
        rows.push(['Anomaly Rate', aiMetrics.anomalyRate + '%']);
        rows.push(['Cosine Similarity', aiMetrics.cosineSimilarity + '%']);
        rows.push(['Processing Efficiency', aiMetrics.processingEfficiency + ' rec/s']);
        rows.push(['Confidence Band Lower (P10)', aiMetrics.modelConfidenceBand.lower + '%']);
        rows.push(['Confidence Band Mid (P50)', aiMetrics.modelConfidenceBand.mid + '%']);
        rows.push(['Confidence Band Upper (P90)', aiMetrics.modelConfidenceBand.upper + '%']);
    }
    downloadCsv(rows, 'analysis_summary.csv');
}
