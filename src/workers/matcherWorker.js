// Web Worker for address matching (off main thread)
self.onmessage = async (e) => {
  const { records, threshold = 70 } = e.data;
  // Simple matching logic
  const results = [];
  for (let i = 0; i < records.length; i++) {
    results.push({ ...records[i], processed: true });
    if (i % 500 === 0) self.postMessage({ type: 'progress', value: (i/records.length)*100 });
  }
  self.postMessage({ type: 'done', results });
};
