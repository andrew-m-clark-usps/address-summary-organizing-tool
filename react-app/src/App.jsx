import React from 'react';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement
} from 'chart.js';
import { AppProvider, useApp } from './context/AppContext';
import Header from './components/Header';
import TabNav from './components/TabNav';
import LandingPage from './components/LandingPage';
import LoadingOverlay from './components/LoadingOverlay';
import DashboardTab from './components/DashboardTab';
import MatchSummaryTab from './components/MatchSummaryTab';
import GeographicTab from './components/GeographicTab';
import QualityTab from './components/QualityTab';
import AIMetricsTab from './components/AIMetricsTab';
import DetailedResultsTab from './components/DetailedResultsTab';
import ExportTab from './components/ExportTab';

ChartJS.register(
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement
);

function AppContent() {
    const { state } = useApp();

    return (
        <div className="app-wrapper">
            <Header />
            <LoadingOverlay />
            {state.view === 'landing' ? (
                <LandingPage />
            ) : (
                <main className="main-content">
                    <TabNav />
                    <div className="tab-contents">
                        {state.currentTab === 'dashboard'     && <DashboardTab />}
                        {state.currentTab === 'match-summary' && <MatchSummaryTab />}
                        {state.currentTab === 'geographic'    && <GeographicTab />}
                        {state.currentTab === 'quality'       && <QualityTab />}
                        {state.currentTab === 'ai-metrics'    && <AIMetricsTab />}
                        {state.currentTab === 'detailed'      && <DetailedResultsTab />}
                        {state.currentTab === 'export'        && <ExportTab />}
                    </div>
                </main>
            )}
        </div>
    );
}

export default function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}
