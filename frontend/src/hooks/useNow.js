import { useEffect, useState } from 'react';

// Re-renders on a timer so "4 min ago" keeps counting. Screen readers are not told about ticks.
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
