import React from 'react';
import { useApp } from '../context/AppContext';
import DataTable from './DataTable';

export default function GeographicTab() {
    const { state } = useApp();
    const { analysis } = state;
    if (!analysis) return <div className="tab-empty">No analysis data available.</div>;

    const { geo, cities } = analysis;

    const stateRows = geo.stateA.slice(0, 20).map(s => {
        const bEntry = geo.stateB.find(b => b.state === s.state);
        return [s.state, s.count.toLocaleString(), (bEntry ? bEntry.count : 0).toLocaleString()];
    });

    const cityRows = cities.slice(0, 20).map(c => [
        c.city, c.countA.toLocaleString(), c.countB.toLocaleString()
    ]);

    const geoMatchRows = geo.geoMatch.slice(0, 20).map(s => [
        s.state,
        s.matched.toLocaleString(),
        s.unmatchedA.toLocaleString(),
        s.unmatchedB.toLocaleString(),
        s.total.toLocaleString()
    ]);

    return (
        <div className="tab-content active" id="tab-geographic">
            <h2 className="tab-title">🗺️ Geographic Breakdown</h2>

            <div className="geo-grid">
                <div className="table-section">
                    <h3>State Distribution</h3>
                    <div className="table-scroll">
                        <DataTable
                            headers={['State', 'System A', 'System B']}
                            rows={stateRows}
                            emptyMessage="No state data."
                        />
                    </div>
                </div>

                <div className="table-section">
                    <h3>Top Cities</h3>
                    <div className="table-scroll">
                        <DataTable
                            headers={['City', 'System A', 'System B']}
                            rows={cityRows}
                            emptyMessage="No city data."
                        />
                    </div>
                </div>
            </div>

            <div className="table-section" style={{ marginTop: '2rem' }}>
                <h3>Geographic Match Breakdown by State</h3>
                <div className="table-scroll">
                    <DataTable
                        headers={['State', 'Matched', 'Unmatched A', 'Unmatched B', 'Total']}
                        rows={geoMatchRows}
                        emptyMessage="No geographic match data."
                    />
                </div>
            </div>
        </div>
    );
}
