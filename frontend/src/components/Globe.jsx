import { useEffect, useRef } from 'react';
import { createGlobe } from '../utils/globeScene';
import './Globe.css';

export default function Globe({ events, threats, paused }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const lastDrawnRef = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const globe = createGlobe(mountRef.current, { reducedMotion });
    globeRef.current = globe;
    return () => {
      globe.dispose();
      globeRef.current = null;
      lastDrawnRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!events.length) return;
    const index = events.findIndex((event) => event.id === lastDrawnRef.current);
    // First render or reconnect: draw a few, not the whole backlog
    const fresh = index === -1 ? events.slice(-3) : events.slice(index + 1);
    for (const event of fresh) globeRef.current.addArc(event);
    lastDrawnRef.current = events.at(-1).id;
  }, [events]);

  useEffect(() => globeRef.current.setThreats(threats), [threats]);
  useEffect(() => globeRef.current.setPaused(paused), [paused]);

  return (
    <div
      ref={mountRef}
      className="globe-container"
      role="img"
      aria-label="Globe of attack routes between countries. The same data is listed in the panels."
    />
  );
}
