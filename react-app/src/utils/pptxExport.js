import PptxGenJS from 'pptxgenjs';

function formatNumber(n) {
    return (n || 0).toLocaleString();
}

function pct(n, d) {
    return d > 0 ? Math.round((n / d) * 100) : 0;
}

export async function exportPowerPoint({ analysis, matchResults, chartRefs }) {
    if (!analysis) throw new Error('No analysis data available.');

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const ACCENT  = '3B82F6';
    const DARK    = '0F172A';
    const SURFACE = '1E293B';
    const TEXT    = 'F1F5F9';
    const MUTED   = '94A3B8';
    const GREEN   = '10B981';
    const AMBER   = 'F59E0B';
    const RED     = 'EF4444';
    const PURPLE  = '8B5CF6';

    const { summary, quality, geo, cities } = analysis;
    const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    function addBg(slide, color) {
        slide.background = { color: color || DARK };
    }

    function addTitle(slide, title, sub) {
        slide.addText(title, {
            x: 0.4, y: 0.2, w: 12.5, h: 0.6,
            fontSize: 24, bold: true, color: TEXT, fontFace: 'Calibri'
        });
        if (sub) {
            slide.addText(sub, {
                x: 0.4, y: 0.85, w: 12.5, h: 0.3,
                fontSize: 13, color: MUTED, fontFace: 'Calibri'
            });
        }
        slide.addShape(pptx.ShapeType.rect, {
            x: 0.4, y: 1.15, w: 12.5, h: 0.04, fill: { color: ACCENT }
        });
    }

    function statBox(slide, x, y, w, h, label, value, barColor) {
        slide.addShape(pptx.ShapeType.rect, {
            x, y, w, h, fill: { color: SURFACE }, line: { color: '334155', width: 0.5 }, rounding: 0.1
        });
        slide.addText(String(value), {
            x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h * 0.55,
            fontSize: 22, bold: true, color: TEXT, align: 'center', fontFace: 'Calibri'
        });
        slide.addText(label, {
            x: x + 0.1, y: y + h * 0.6, w: w - 0.2, h: h * 0.35,
            fontSize: 10, color: MUTED, align: 'center', fontFace: 'Calibri'
        });
        if (barColor) {
            slide.addShape(pptx.ShapeType.rect, {
                x, y: y + h - 0.05, w, h: 0.05, fill: { color: barColor }
            });
        }
    }

    function getChartUrl(refKey) {
        if (chartRefs && chartRefs[refKey]) {
            const canvas = chartRefs[refKey];
            if (canvas && canvas.toDataURL) return canvas.toDataURL('image/png');
        }
        return null;
    }

    // Slide 1: Title
    const slideTitle = pptx.addSlide();
    addBg(slideTitle, DARK);
    slideTitle.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: DARK } });
    slideTitle.addShape(pptx.ShapeType.rect, { x: 0, y: 5.5, w: 13.33, h: 2.0, fill: { color: SURFACE } });
    slideTitle.addText('📊 Address Summary Organizing Tool', {
        x: 1, y: 1.5, w: 11.3, h: 1,
        fontSize: 32, bold: true, color: TEXT, align: 'center', fontFace: 'Calibri'
    });
    slideTitle.addText('Analysis Breakdown Report', {
        x: 1, y: 2.65, w: 11.3, h: 0.6,
        fontSize: 20, color: MUTED, align: 'center', fontFace: 'Calibri'
    });
    slideTitle.addShape(pptx.ShapeType.rect, { x: 4.5, y: 3.4, w: 4.33, h: 0.06, fill: { color: ACCENT } });
    slideTitle.addText(`System A: ${formatNumber(summary.totalA)} records  |  System B: ${formatNumber(summary.totalB)} records`, {
        x: 1, y: 3.65, w: 11.3, h: 0.4, fontSize: 13, color: MUTED, align: 'center', fontFace: 'Calibri'
    });
    slideTitle.addText(`Generated: ${now}`, {
        x: 1, y: 6.0, w: 11.3, h: 0.35, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Calibri'
    });

    // Slide 2: Match Summary Stats
    const slideStats = pptx.addSlide();
    addBg(slideStats);
    addTitle(slideStats, 'Match Summary', `Analysis of ${formatNumber(summary.totalA)} System A records vs ${formatNumber(summary.totalB)} System B records`);

    const boxW = 1.9, boxH = 1.1, gap = 0.15;
    const startX = 0.5;
    const row1Y = 1.4;
    const boxes = [
        { label: 'System A Total',  value: formatNumber(summary.totalA),    color: ACCENT },
        { label: 'System B Total',  value: formatNumber(summary.totalB),    color: PURPLE },
        { label: 'Matched',         value: formatNumber(summary.matched),   color: GREEN },
        { label: 'Match Rate',      value: summary.matchPct + '%',          color: GREEN },
        { label: 'Unmatched A',     value: formatNumber(summary.unmatchedA), color: ACCENT },
        { label: 'Unmatched B',     value: formatNumber(summary.unmatchedB), color: PURPLE }
    ];
    boxes.forEach((b, i) => {
        statBox(slideStats, startX + i * (boxW + gap), row1Y, boxW, boxH, b.label, b.value, b.color);
    });

    const row2Y = row1Y + boxH + 0.3;
    const boxes2 = [
        { label: 'Perfect (100%)',   value: formatNumber(summary.perfect), color: GREEN },
        { label: 'High (90-99%)',    value: formatNumber(summary.high),    color: '84CC16' },
        { label: 'Partial (70-89%)', value: formatNumber(summary.partial), color: AMBER },
        { label: 'Low (50-69%)',     value: formatNumber(summary.low),     color: 'F97316' },
        { label: 'No Match (<50%)',  value: formatNumber(summary.veryLow), color: RED },
    ];
    boxes2.forEach((b, i) => {
        statBox(slideStats, startX + i * (boxW + gap), row2Y, boxW, boxH, b.label, b.value, b.color);
    });

    const barY = row2Y + boxH + 0.35;
    slideStats.addText(`Overall Match Rate: ${summary.matchPct}%`, {
        x: 0.5, y: barY, w: 4, h: 0.35, fontSize: 13, color: TEXT, fontFace: 'Calibri', bold: true
    });
    const barW = 12.33;
    slideStats.addShape(pptx.ShapeType.rect, { x: 0.5, y: barY + 0.4, w: barW, h: 0.25, fill: { color: '334155' }, rounding: 0.05 });
    slideStats.addShape(pptx.ShapeType.rect, { x: 0.5, y: barY + 0.4, w: barW * (summary.matchPct / 100), h: 0.25, fill: { color: GREEN }, rounding: 0.05 });

    // Slide 3: Match Distribution Chart
    const slideMatchDist = pptx.addSlide();
    addBg(slideMatchDist);
    addTitle(slideMatchDist, 'Match Distribution', 'Breakdown of records by match confidence level');
    const distUrl = getChartUrl('matchDist');
    if (distUrl) slideMatchDist.addImage({ data: distUrl, x: 1.2, y: 1.3, w: 5, h: 5 });
    const distItems = [
        { label: 'Perfect Match (100%)',    value: summary.perfect,  p: pct(summary.perfect, summary.matched),  color: GREEN },
        { label: 'High Confidence (90-99%)',value: summary.high,     p: pct(summary.high, summary.matched),     color: '84CC16' },
        { label: 'Partial Match (70-89%)',  value: summary.partial,  p: pct(summary.partial, summary.matched),  color: AMBER },
        { label: 'Low Confidence (50-69%)', value: summary.low,      p: pct(summary.low, summary.matched),      color: 'F97316' },
        { label: 'No Match (<50%)',         value: summary.veryLow,  p: pct(summary.veryLow, summary.matched),  color: RED },
    ];
    distItems.forEach((item, i) => {
        const iy = 1.5 + i * 0.72;
        slideMatchDist.addShape(pptx.ShapeType.rect, { x: 7.2, y: iy, w: 0.18, h: 0.18, fill: { color: item.color }, rounding: 0.05 });
        slideMatchDist.addText(`${item.label}`, { x: 7.5, y: iy - 0.02, w: 3.5, h: 0.25, fontSize: 11, color: TEXT, fontFace: 'Calibri' });
        slideMatchDist.addText(`${formatNumber(item.value)} records (${item.p}%)`, { x: 7.5, y: iy + 0.22, w: 3.5, h: 0.2, fontSize: 10, color: MUTED, fontFace: 'Calibri' });
    });

    // Slide 4: Confidence Histogram
    const slideHist = pptx.addSlide();
    addBg(slideHist);
    addTitle(slideHist, 'Match Confidence Distribution', 'Number of records by confidence score range');
    const histUrl = getChartUrl('confidenceHist');
    if (histUrl) slideHist.addImage({ data: histUrl, x: 0.5, y: 1.3, w: 12.3, h: 5.5 });

    // Slide 5: Geographic Breakdown
    const slideGeo = pptx.addSlide();
    addBg(slideGeo);
    addTitle(slideGeo, 'Geographic Breakdown', 'Top states by record volume — matched vs unmatched');
    const statesUrl = getChartUrl('topStates');
    if (statesUrl) slideGeo.addImage({ data: statesUrl, x: 0.5, y: 1.3, w: 12.3, h: 5.5 });

    // Slide 6: Top Cities
    const slideCities = pptx.addSlide();
    addBg(slideCities);
    addTitle(slideCities, 'Top Cities Comparison', 'Record volume by city — System A vs System B');
    const citiesUrl = getChartUrl('topCities');
    if (citiesUrl) slideCities.addImage({ data: citiesUrl, x: 0.5, y: 1.3, w: 6.1, h: 5.5 });
    const topCities = cities.slice(0, 10);
    const tblData = [
        [
            { text: 'City', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
            { text: 'Sys A', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
            { text: 'Sys B', options: { bold: true, color: TEXT, fill: { color: ACCENT } } }
        ],
        ...topCities.map(c => [
            { text: c.city, options: { color: TEXT } },
            { text: formatNumber(c.countA), options: { color: '93C5FD', align: 'center' } },
            { text: formatNumber(c.countB), options: { color: 'C4B5FD', align: 'center' } }
        ])
    ];
    slideCities.addTable(tblData, {
        x: 7, y: 1.4, w: 6.0, h: 5.4,
        fontSize: 11, fontFace: 'Calibri', rowH: 0.42,
        border: { color: '334155', pt: 0.5 }, fill: { color: SURFACE }
    });

    // Slide 7: Address Quality
    const slideQuality = pptx.addSlide();
    addBg(slideQuality);
    addTitle(slideQuality, 'Address Quality Analysis', 'Completeness and validity metrics per system');
    const qualUrl = getChartUrl('addressQuality');
    if (qualUrl) slideQuality.addImage({ data: qualUrl, x: 0.5, y: 1.3, w: 5, h: 5 });
    const qMetrics = [
        [{ text: 'Metric', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
         { text: 'System A', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
         { text: 'System B', options: { bold: true, color: TEXT, fill: { color: ACCENT } } }],
        ...([
            ['Complete Addresses', formatNumber(quality.a.complete), formatNumber(quality.b.complete)],
            ['Incomplete Addresses', formatNumber(quality.a.incomplete), formatNumber(quality.b.incomplete)],
            ['Missing ZIP', formatNumber(quality.a.missingZip), formatNumber(quality.b.missingZip)],
            ['Missing City', formatNumber(quality.a.missingCity), formatNumber(quality.b.missingCity)],
            ['Missing State', formatNumber(quality.a.missingState), formatNumber(quality.b.missingState)],
            ['Invalid ZIP', formatNumber(quality.a.invalidZip), formatNumber(quality.b.invalidZip)],
            ['Duplicate Addresses', formatNumber(quality.a.duplicates), formatNumber(quality.b.duplicates)],
            ['Street Complete %', quality.a.fieldCompleteness.street + '%', quality.b.fieldCompleteness.street + '%'],
            ['City Complete %', quality.a.fieldCompleteness.city + '%', quality.b.fieldCompleteness.city + '%'],
            ['State Complete %', quality.a.fieldCompleteness.state + '%', quality.b.fieldCompleteness.state + '%'],
            ['ZIP Complete %', quality.a.fieldCompleteness.zip + '%', quality.b.fieldCompleteness.zip + '%'],
        ].map(r => r.map((c, i) => ({ text: c, options: { color: i === 0 ? MUTED : TEXT } }))))
    ];
    slideQuality.addTable(qMetrics, {
        x: 6.5, y: 1.4, w: 6.5, h: 5.8,
        fontSize: 11, fontFace: 'Calibri', rowH: 0.44,
        border: { color: '334155', pt: 0.5 }, fill: { color: SURFACE }
    });

    // Slide 8: Data Completeness by Field
    const slideComplete = pptx.addSlide();
    addBg(slideComplete);
    addTitle(slideComplete, 'Data Completeness by Field', 'Percentage of complete values per field, System A vs System B');
    const completeUrl = getChartUrl('fieldCompleteness');
    if (completeUrl) slideComplete.addImage({ data: completeUrl, x: 0.5, y: 1.3, w: 12.3, h: 5.5 });

    // Slide 9: Discrepancy Analysis
    const slideDisc = pptx.addSlide();
    addBg(slideDisc);
    addTitle(slideDisc, 'Discrepancy Analysis', 'Types of mismatches found in matched records');
    const discUrl = getChartUrl('discrepancy');
    if (discUrl) slideDisc.addImage({ data: discUrl, x: 0.7, y: 1.3, w: 5, h: 5 });
    const discEntries = Object.entries(summary.discrepancyTypes).sort((a, b) => b[1] - a[1]);
    const discTbl = [
        [{ text: 'Discrepancy Type', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
         { text: 'Count', options: { bold: true, color: TEXT, fill: { color: ACCENT } } },
         { text: '% of Matched', options: { bold: true, color: TEXT, fill: { color: ACCENT } } }],
        ...(discEntries.length > 0 ? discEntries.map(([k, v]) => [
            { text: k, options: { color: TEXT } },
            { text: formatNumber(v), options: { color: AMBER, align: 'center' } },
            { text: pct(v, summary.matched) + '%', options: { color: MUTED, align: 'center' } }
        ]) : [[
            { text: 'No discrepancies found', options: { color: GREEN } },
            { text: '0', options: { color: TEXT, align: 'center' } },
            { text: '0%', options: { color: TEXT, align: 'center' } }
        ]])
    ];
    slideDisc.addTable(discTbl, {
        x: 6.5, y: 1.4, w: 6.5, h: 3.5,
        fontSize: 11, fontFace: 'Calibri', rowH: 0.44,
        border: { color: '334155', pt: 0.5 }, fill: { color: SURFACE }
    });

    // Slide 10: Record Volume Comparison
    const slideVol = pptx.addSlide();
    addBg(slideVol);
    addTitle(slideVol, 'Record Volume Comparison', 'Overlap and unique records per system');
    const volUrl = getChartUrl('volume');
    if (volUrl) slideVol.addImage({ data: volUrl, x: 2, y: 1.3, w: 9, h: 5.5 });

    // Slide 11: Summary / Recommendations
    const slideSummary = pptx.addSlide();
    addBg(slideSummary);
    addTitle(slideSummary, 'Summary & Key Findings', 'Generated by Address Summary Organizing Tool');
    const findings = [
        `📊 Analyzed ${formatNumber(summary.totalA)} System A records and ${formatNumber(summary.totalB)} System B records`,
        `✅ ${formatNumber(summary.matched)} records matched (${summary.matchPct}% match rate)`,
        `🎯 ${formatNumber(summary.perfect)} perfect matches — exact address found in both systems`,
        `⚠️  ${formatNumber(summary.unmatchedA)} records in System A have no match in System B`,
        `⚠️  ${formatNumber(summary.unmatchedB)} records in System B have no match in System A`,
        `📋 System A address completeness: ${quality.a.completePct}%`,
        `📋 System B address completeness: ${quality.b.completePct}%`,
    ];
    findings.forEach((text, i) => {
        slideSummary.addText(text, {
            x: 0.6, y: 1.5 + i * 0.65, w: 12.1, h: 0.5,
            fontSize: 13, color: TEXT, fontFace: 'Calibri'
        });
    });
    slideSummary.addText(`Report generated: ${now}`, {
        x: 0.6, y: 6.9, w: 12.1, h: 0.3, fontSize: 10, color: MUTED, fontFace: 'Calibri'
    });

    // Slide 12: AI Metrics Overview
    const { aiMetrics, matchDetails } = analysis;
    if (aiMetrics) {
        const slideAI = pptx.addSlide();
        addBg(slideAI);
        addTitle(slideAI, '🤖 AI / ML Metrics Overview', 'Statistical model evaluation metrics derived from matching analysis');
        const aiBoxes = [
            { label: 'Precision',        value: aiMetrics.precision + '%',        color: GREEN  },
            { label: 'Recall',           value: aiMetrics.recall + '%',           color: GREEN  },
            { label: 'F1 Score',         value: aiMetrics.f1Score + '%',          color: ACCENT },
            { label: 'Accuracy',         value: aiMetrics.accuracy + '%',         color: ACCENT },
            { label: 'Jaccard Index',    value: aiMetrics.jaccardIndex + '%',     color: PURPLE },
            { label: 'Confidence Index', value: aiMetrics.overallConfidence + '%', color: GREEN  }
        ];
        const aiBoxW = 1.9, aiBoxH = 1.1, aiGap = 0.15, aiStartX = 0.5, aiRow1Y = 1.4;
        aiBoxes.forEach((b, i) => {
            statBox(slideAI, aiStartX + i * (aiBoxW + aiGap), aiRow1Y, aiBoxW, aiBoxH, b.label, b.value, b.color);
        });
        const aiRow2 = [
            { label: 'False Pos. Risk',  value: aiMetrics.falsePositiveRisk + '%',    color: AMBER },
            { label: 'Anomaly Rate',     value: aiMetrics.anomalyRate + '%',           color: AMBER },
            { label: 'Shannon Entropy',  value: aiMetrics.entropy.toFixed(2),          color: MUTED },
            { label: 'Gini Coeff.',      value: aiMetrics.giniCoefficient.toFixed(3),  color: MUTED },
            { label: 'Geo Similarity',   value: aiMetrics.cosineSimilarity + '%',      color: ACCENT }
        ];
        const aiRow2Y = aiRow1Y + aiBoxH + 0.3;
        aiRow2.forEach((b, i) => {
            statBox(slideAI, aiStartX + i * (aiBoxW + aiGap), aiRow2Y, aiBoxW, aiBoxH, b.label, b.value, b.color);
        });
        if (matchDetails) {
            const bandY = aiRow2Y + aiBoxH + 0.4;
            slideAI.addText(`Model Confidence Band — P10: ${matchDetails.scorePercentiles.p10}%  |  P50: ${matchDetails.scorePercentiles.p50}%  |  P90: ${matchDetails.scorePercentiles.p90}%`, {
                x: 0.5, y: bandY, w: 12, h: 0.4, fontSize: 12, color: TEXT, fontFace: 'Calibri', align: 'center'
            });
            const bandTrackW = 11;
            slideAI.addShape(pptx.ShapeType.rect, { x: 1.0, y: bandY + 0.5, w: bandTrackW, h: 0.2, fill: { color: '334155' }, rounding: 0.05 });
            const p10x = 1.0 + (matchDetails.scorePercentiles.p10 / 100) * bandTrackW;
            const p90x = 1.0 + (matchDetails.scorePercentiles.p90 / 100) * bandTrackW;
            const p50x = 1.0 + (matchDetails.scorePercentiles.p50 / 100) * bandTrackW;
            slideAI.addShape(pptx.ShapeType.rect, { x: p10x, y: bandY + 0.5, w: p90x - p10x, h: 0.2, fill: { color: ACCENT + '66' }, rounding: 0.05 });
            slideAI.addShape(pptx.ShapeType.rect, { x: p50x - 0.03, y: bandY + 0.45, w: 0.06, h: 0.3, fill: { color: GREEN } });
        }
        const aiChartUrl = getChartUrl('matchTypeDonut');
        if (aiChartUrl) slideAI.addImage({ data: aiChartUrl, x: 9.5, y: 1.4, w: 3.3, h: 3.0 });
    }

    // Slide 13: Data Quality Scores
    if (aiMetrics) {
        const slideDQ = pptx.addSlide();
        addBg(slideDQ);
        addTitle(slideDQ, 'Data Quality Scores', 'Composite quality index per system — completeness, validity & deduplication');
        statBox(slideDQ, 1.5,  1.4, 4, 1.5, 'System A — DQ Score', aiMetrics.dqScoreA.toFixed(1) + '%',
            aiMetrics.dqScoreA >= 90 ? GREEN : aiMetrics.dqScoreA >= 70 ? '84CC16' : aiMetrics.dqScoreA >= 55 ? AMBER : RED);
        statBox(slideDQ, 7.83, 1.4, 4, 1.5, 'System B — DQ Score', aiMetrics.dqScoreB.toFixed(1) + '%',
            aiMetrics.dqScoreB >= 90 ? GREEN : aiMetrics.dqScoreB >= 70 ? '84CC16' : aiMetrics.dqScoreB >= 55 ? AMBER : RED);
        const dqQRows = [
            ['Metric', 'System A', 'System B'],
            ['Complete %', quality.a.completePct + '%', quality.b.completePct + '%'],
            ['Invalid ZIP %', quality.a.invalidZipPct + '%', quality.b.invalidZipPct + '%'],
            ['Invalid State %', quality.a.invalidStatePct + '%', quality.b.invalidStatePct + '%'],
            ['Duplicate %', quality.a.duplicatePct + '%', quality.b.duplicatePct + '%'],
            ['Avg Fields', quality.a.avgFieldsPopulated.toFixed(2), quality.b.avgFieldsPopulated.toFixed(2)],
            ['Secondary Units', formatNumber(quality.a.recordsWithSecondaryUnit), formatNumber(quality.b.recordsWithSecondaryUnit)],
            ['ZIP+4 Count', formatNumber(quality.a.hasZipPlus4Count), formatNumber(quality.b.hasZipPlus4Count)],
            ['Standardized St%', quality.a.standardizedStreetPct + '%', quality.b.standardizedStreetPct + '%'],
        ];
        const dqTbl = [
            dqQRows[0].map((t, i) => ({ text: t, options: { bold: true, color: TEXT, fill: { color: i === 0 ? SURFACE : ACCENT } } })),
            ...dqQRows.slice(1).map(r => r.map((c, i) => ({ text: c, options: { color: i === 0 ? MUTED : TEXT } })))
        ];
        slideDQ.addTable(dqTbl, {
            x: 1.5, y: 3.2, w: 10.3, h: 3.8,
            fontSize: 11, fontFace: 'Calibri', rowH: 0.38,
            border: { color: '334155', pt: 0.5 }, fill: { color: SURFACE }
        });
        const dqUrl = getChartUrl('dqComparison');
        if (dqUrl) slideDQ.addImage({ data: dqUrl, x: 1.5, y: 7.0, w: 4.0, h: 0.5 });
    }

    await pptx.writeFile({ fileName: 'Address_Analysis_Report.pptx' });
}
