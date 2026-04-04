import React from 'react';
import { useApp } from '../context/AppContext';
import Pagination, { PAGE_SIZE } from './Pagination';
import { getConfidenceBadgeClass } from '../engine/matcher';

function esc(str) {
    if (!str) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return String(str);
}

function getFilteredMatched(matchResults, matchedFilter, matchedSort) {
    if (!matchResults) return [];
    let rows = matchResults.matched;
    const { search, confidence, state: stateFilter } = matchedFilter;
    if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(m =>
            (m.recordA.street || '').toLowerCase().includes(s) ||
            (m.recordA.city   || '').toLowerCase().includes(s) ||
            (m.recordB.street || '').toLowerCase().includes(s) ||
            (m.recordB.city   || '').toLowerCase().includes(s)
        );
    }
    if (confidence && confidence !== 'all') {
        rows = rows.filter(m => {
            const score = m.score;
            if (confidence === 'perfect') return score === 100;
            if (confidence === 'high') return score >= 90 && score < 100;
            if (confidence === 'partial') return score >= 70 && score < 90;
            if (confidence === 'low') return score >= 50 && score < 70;
            return true;
        });
    }
    if (stateFilter) {
        const sf = stateFilter.toUpperCase();
        rows = rows.filter(m =>
            (m.recordA.state || '').toUpperCase() === sf ||
            (m.recordB.state || '').toUpperCase() === sf
        );
    }
    const { col, dir } = matchedSort;
    rows = [...rows].sort((a, b) => {
        let va, vb;
        if (col === 'score') { va = a.score; vb = b.score; }
        else if (col === 'stateA') { va = a.recordA.state || ''; vb = b.recordA.state || ''; }
        else if (col === 'cityA') { va = a.recordA.city || ''; vb = b.recordA.city || ''; }
        else { va = a.score; vb = b.score; }
        if (typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
        return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return rows;
}

export default function DetailedResultsTab() {
    const { state, dispatch } = useApp();
    const { matchResults, matchedPage, unmatchedAPage, unmatchedBPage, matchedFilter, matchedSort } = state;

    const filteredMatched = getFilteredMatched(matchResults, matchedFilter, matchedSort);
    const matchedStart = (matchedPage - 1) * PAGE_SIZE;
    const matchedPage_ = filteredMatched.slice(matchedStart, matchedStart + PAGE_SIZE);

    const unmatchedA = matchResults?.unmatchedA || [];
    const unmatchedB = matchResults?.unmatchedB || [];
    const unmatchedAStart = (unmatchedAPage - 1) * PAGE_SIZE;
    const unmatchedBStart = (unmatchedBPage - 1) * PAGE_SIZE;
    const unmatchedAPage_ = unmatchedA.slice(unmatchedAStart, unmatchedAStart + PAGE_SIZE);
    const unmatchedBPage_ = unmatchedB.slice(unmatchedBStart, unmatchedBStart + PAGE_SIZE);

    return (
        <div className="tab-content active" id="tab-detailed">
            <h2 className="tab-title">📋 Detailed Results</h2>

            {/* Matched Records */}
            <div className="results-section">
                <div className="results-section-header">
                    <h3>Matched Records</h3>
                    <span className="record-count">{filteredMatched.length.toLocaleString()} records</span>
                </div>

                <div className="filter-bar">
                    <input
                        type="text"
                        placeholder="Search street or city…"
                        className="filter-input"
                        value={matchedFilter.search}
                        onChange={e => dispatch({ type: 'SET_MATCHED_FILTER', payload: { search: e.target.value } })}
                    />
                    <select
                        className="filter-select"
                        value={matchedFilter.confidence}
                        onChange={e => dispatch({ type: 'SET_MATCHED_FILTER', payload: { confidence: e.target.value } })}
                    >
                        <option value="all">All Confidence</option>
                        <option value="perfect">Perfect (100%)</option>
                        <option value="high">High (90-99%)</option>
                        <option value="partial">Partial (70-89%)</option>
                        <option value="low">Low (50-69%)</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Filter by State…"
                        className="filter-input filter-input-sm"
                        value={matchedFilter.state}
                        onChange={e => dispatch({ type: 'SET_MATCHED_FILTER', payload: { state: e.target.value } })}
                    />
                </div>

                <div className="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Score</th>
                                <th>Street A</th><th>City A</th><th>State A</th><th>ZIP A</th>
                                <th>Street B</th><th>City B</th><th>State B</th><th>ZIP B</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matchedPage_.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No records match the current filter.</td></tr>
                            ) : matchedPage_.map((m, i) => (
                                <tr key={i}>
                                    <td><span className={`badge ${getConfidenceBadgeClass(m.score)}`}>{m.score}%</span></td>
                                    <td>{esc(m.recordA.street)}</td>
                                    <td>{esc(m.recordA.city)}</td>
                                    <td>{esc(m.recordA.state)}</td>
                                    <td>{esc(m.recordA.zip)}</td>
                                    <td>{esc(m.recordB.street)}</td>
                                    <td>{esc(m.recordB.city)}</td>
                                    <td>{esc(m.recordB.state)}</td>
                                    <td>{esc(m.recordB.zip)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={matchedPage}
                    totalItems={filteredMatched.length}
                    onPage={p => dispatch({ type: 'SET_MATCHED_PAGE', payload: p })}
                />
            </div>

            {/* Unmatched A */}
            <div className="results-section">
                <div className="results-section-header">
                    <h3>Unmatched — System A</h3>
                    <span className="record-count">{unmatchedA.length.toLocaleString()} records</span>
                </div>
                <div className="table-scroll">
                    <table>
                        <thead><tr><th>Street</th><th>City</th><th>State</th><th>ZIP</th></tr></thead>
                        <tbody>
                            {unmatchedAPage_.length === 0 ? (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No unmatched records.</td></tr>
                            ) : unmatchedAPage_.map((rec, i) => (
                                <tr key={i}>
                                    <td>{esc(rec.street)}</td>
                                    <td>{esc(rec.city)}</td>
                                    <td>{esc(rec.state)}</td>
                                    <td>{esc(rec.zip)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={unmatchedAPage}
                    totalItems={unmatchedA.length}
                    onPage={p => dispatch({ type: 'SET_UNMATCHED_A_PAGE', payload: p })}
                />
            </div>

            {/* Unmatched B */}
            <div className="results-section">
                <div className="results-section-header">
                    <h3>Unmatched — System B</h3>
                    <span className="record-count">{unmatchedB.length.toLocaleString()} records</span>
                </div>
                <div className="table-scroll">
                    <table>
                        <thead><tr><th>Street</th><th>City</th><th>State</th><th>ZIP</th></tr></thead>
                        <tbody>
                            {unmatchedBPage_.length === 0 ? (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No unmatched records.</td></tr>
                            ) : unmatchedBPage_.map((rec, i) => (
                                <tr key={i}>
                                    <td>{esc(rec.street)}</td>
                                    <td>{esc(rec.city)}</td>
                                    <td>{esc(rec.state)}</td>
                                    <td>{esc(rec.zip)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={unmatchedBPage}
                    totalItems={unmatchedB.length}
                    onPage={p => dispatch({ type: 'SET_UNMATCHED_B_PAGE', payload: p })}
                />
            </div>
        </div>
    );
}
