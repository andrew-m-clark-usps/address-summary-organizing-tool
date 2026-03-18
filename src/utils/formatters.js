export const formatNumber = (n) => n?.toLocaleString() ?? '0';
export const formatPercent = (n, d=1) => `${(n*100).toFixed(d)}%`;
export const formatLatLon = (v) => parseFloat(v||0).toFixed(4);
export const formatScore = (v) => `${Math.round(v||0)}%`;
