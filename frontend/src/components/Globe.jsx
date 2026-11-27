import { useEffect, useRef } from 'react';
import { matchesEvent } from '../utils/filters';
import { createGlobe } from '../utils/globeScene';

const STEP = 0.12;

export default function Globe({ events, threats, paused, filters, reducedMotion, highlight, onHover, onSelect, onTogglePause }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const lastDrawnRef = useRef(null);
  const latest = useRef({});
  useEffect(() => { latest.current = { filters, onHover, onSelect, reducedMotion }; });

  useEffect(() => {
    const globe = createGlobe(mountRef.current, {
      reducedMotion: latest.current.reducedMotion,
      onHover: (item, x, y) => latest.current.onHover(item, x, y),
      onSelect: (item) => latest.current.onSelect(item),
    });
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
    for (const event of fresh) if (matchesEvent(latest.current.filters, event)) globeRef.current.addArc(event);
    lastDrawnRef.current = events.at(-1).id;
  }, [events]);

  useEffect(() => globeRef.current.setThreats(threats), [threats]);
  useEffect(() => globeRef.current.setPaused(paused), [paused]);
  useEffect(() => globeRef.current.setReducedMotion(reducedMotion), [reducedMotion]);
  useEffect(() => globeRef.current.setHighlight(highlight), [highlight]);

  function onKeyDown(event) {
    const globe = globeRef.current;
    const moves = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    if (moves[event.key]) globe.rotate(...moves[event.key]);
    else if (event.key === '+' || event.key === '=') globe.zoom(0.85);
    else if (event.key === '-' || event.key === '_') globe.zoom(1.18);
    else if (event.key === ' ') onTogglePause();
    else return;
    event.preventDefault();
  }

  return (
    <div
      ref={mountRef}
      className="globe-container"
      tabIndex={0}
      role="group"
      aria-label="3D globe of attack routes. Arrow keys rotate, plus and minus zoom, space pauses. The same data is listed in the panels."
      onKeyDown={onKeyDown}
    />
  );
}
