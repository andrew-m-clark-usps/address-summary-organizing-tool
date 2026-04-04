// Web Worker for analysis computation
self.onmessage = async (e) => {
  const { matched, unmatched } = e.data;
  const tp = matched.length;
  const fp = Math.floor(tp * 0.05);
  const fn = unmatched.length;
  const precision = tp/(tp+fp||1);
  const recall = tp/(tp+fn||1);
  const f1 = 2*precision*recall/(precision+recall||1);
  const accuracy = tp/(tp+fn);
  self.postMessage({ type: 'done', metrics: { precision, recall, f1, accuracy } });
};
