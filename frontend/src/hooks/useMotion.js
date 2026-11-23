import { useEffect } from 'react';
import { useMediaQuery } from './useMediaQuery';
import { usePersistentState } from './usePersistentState';

// The OS setting decides until the person overrides it. One attribute on <html> drives the CSS
// (tokens.css), and the returned flag drives the globe.
export function useMotion() {
  const [pref, setPref] = usePersistentState('dosmap.motion', 'auto');
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reduced = pref === 'reduced' || (pref === 'auto' && system);
  useEffect(() => { document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'; }, [reduced]);
  return { reduced, toggle: () => setPref(reduced ? 'full' : 'reduced') };
}
