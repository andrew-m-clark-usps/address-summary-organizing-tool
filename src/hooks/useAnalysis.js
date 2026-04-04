import { useState } from 'react';
import { runAnalysis } from '../services/analysisService';

export const useAnalysis = () => {
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const analyze = async (dataA, dataB) => {
    setRunning(true); setError(null); setProgress(0);
    try {
      const r = await runAnalysis(dataA, dataB, setProgress);
      setResults(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false); setProgress(100);
    }
  };

  return { results, progress, running, error, analyze };
};
