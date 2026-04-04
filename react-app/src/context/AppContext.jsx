import React, { createContext, useContext, useReducer, useRef } from 'react';

const initialState = {
    dataA: null,
    dataB: null,
    matchResults: null,
    analysis: null,
    currentTab: 'dashboard',
    loading: false,
    loadingText: '',
    loadingSub: '',
    threshold: 70,
    weights: { zip: 40, state: 30, city: 20, street: 10 },
    matchedPage: 1,
    unmatchedAPage: 1,
    unmatchedBPage: 1,
    matchedFilter: { search: '', confidence: 'all', state: '' },
    matchedSort: { col: 'score', dir: 'desc' },
    view: 'landing',
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_DATA_A':
            return { ...state, dataA: action.payload };
        case 'SET_DATA_B':
            return { ...state, dataB: action.payload };
        case 'SET_MATCH_RESULTS':
            return { ...state, matchResults: action.payload };
        case 'SET_ANALYSIS':
            return { ...state, analysis: action.payload };
        case 'SET_TAB':
            return { ...state, currentTab: action.payload };
        case 'SET_LOADING':
            return {
                ...state,
                loading: action.payload.loading,
                loadingText: action.payload.text || '',
                loadingSub: action.payload.sub || ''
            };
        case 'SET_THRESHOLD':
            return { ...state, threshold: action.payload };
        case 'SET_WEIGHTS':
            return { ...state, weights: { ...state.weights, ...action.payload } };
        case 'SET_VIEW':
            return { ...state, view: action.payload };
        case 'SET_MATCHED_PAGE':
            return { ...state, matchedPage: action.payload };
        case 'SET_UNMATCHED_A_PAGE':
            return { ...state, unmatchedAPage: action.payload };
        case 'SET_UNMATCHED_B_PAGE':
            return { ...state, unmatchedBPage: action.payload };
        case 'SET_MATCHED_FILTER':
            return { ...state, matchedFilter: { ...state.matchedFilter, ...action.payload }, matchedPage: 1 };
        case 'SET_MATCHED_SORT':
            return { ...state, matchedSort: action.payload };
        case 'RESET':
            return { ...initialState };
        default:
            return state;
    }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const chartRefsRef = useRef({});

    const value = { state, dispatch, chartRefsRef };
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
