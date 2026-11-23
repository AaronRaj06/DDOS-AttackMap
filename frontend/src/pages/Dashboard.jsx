import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import FilterBar from '../components/FilterBar';
import Header from '../components/Header';
import Legend from '../components/Legend';
import LiveStatus from '../components/LiveStatus';
import Notice from '../components/Notice';
import { SkeletonRows } from '../components/Skeleton';
import StatusTiles from '../components/StatusTiles';
import { useFilters } from '../hooks/useFilters';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useMotion } from '../hooks/useMotion';
import { useNow } from '../hooks/useNow';
import { usePersistentState } from '../hooks/usePersistentState';
import { useWebSocket } from '../hooks/useWebSocket';
import { matchesPoint, matchesRoute } from '../utils/filters';
import { LAYER_SHORT } from '../utils/labels';
import { highlightFor } from '../utils/routes';
import '../styles/dashboard.css';

const Globe = lazy(() => import('../components/Globe'));
const MapView = lazy(() => import('../components/MapView'));
const Panels = lazy(() => import('../components/Panels'));
// Loaded when first needed: a card appears on a click, the sheet only on a phone
const InfoCard = lazy(() => import('../components/InfoCard'));
const Sheet = lazy(() => import('../components/Sheet'));

function hoverText({ item }) {
  if (item.kind === 'arc') return `${item.event.src_name} → ${item.event.dst_name} · ${LAYER_SHORT[item.event.layer]} layer`;
  return `${item.point.network} · ${item.point.flagged ? 'Likely DoS source' : 'Reported abusive IP'}`;
}

export default function Dashboard() {
  const feed = useWebSocket('/ws');
  const { filters, setFilters, kiosk, setKiosk } = useFilters();
  const motion = useMotion();
  const now = useNow();
  const narrow = useMediaQuery('(max-width: 820px)');
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState([]);
  const [view, setView] = usePersistentState('dosmap.view', 'globe');
  const [sheet, setSheet] = useState(false);
  const [idle, setIdle] = useState(false);
  const [selection, setSelection] = useState(null);
  const [hoveredRoute, setHoveredRoute] = useState(null);
  const [hover, setHover] = useState(null);
  const viewportRef = useRef(null);
  const openerRef = useRef(null);

  const { status, spikes, threats, events } = feed;
  const mode = status?.mode ?? null;
  const shownEvents = paused ? frozen : events;
  const visibleCorridors = feed.corridors.filter((route) => matchesRoute(filters, route));
  const visiblePoints = useMemo(() => threats.points.filter((point) => matchesPoint(filters, point)), [threats.points, filters]);
  const highlight = useMemo(() => highlightFor(hoveredRoute, selection), [hoveredRoute, selection]);

  function togglePause() {
    setFrozen(events);
    setPaused(!paused);
  }

  // From the map: a pointer click, so focus stays where it is
  const selectOnMap = useCallback((item) => setSelection(item), []);
  // From a list: a keyboard user, so focus moves to the card, and comes back when it closes
  const selectFromList = useCallback((item) => {
    openerRef.current = document.activeElement;
    setSheet(false);
    setSelection({ ...item, focus: true });
  }, []);
  const closeCard = useCallback(() => {
    setSelection(null);
    openerRef.current?.focus?.();
    openerRef.current = null;
  }, []);
  const hoverOnMap = useCallback((item, x, y) => {
    if (!item || !viewportRef.current) return setHover(null);
    const rect = viewportRef.current.getBoundingClientRect();
    return setHover({ item, x: x - rect.left, y: y - rect.top });
  }, []);

  // Kiosk: Escape leaves it, and the cursor hides after 3 seconds without movement
  useEffect(() => {
    if (!kiosk) return undefined;
    let timer;
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 3000); };
    const onKey = (event) => { if (event.key === 'Escape') setKiosk(false); };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); setIdle(false); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', onKey); };
  }, [kiosk, setKiosk]);

  const mapProps = { events: shownEvents, threats: visiblePoints, filters, highlight, onHover: hoverOnMap, onSelect: selectOnMap, onTogglePause: togglePause };
  const flat = <MapView {...mapProps} />;

  const panels = (
    <Suspense fallback={<SkeletonRows rows={5} label="Loading details" />}>
      <Panels feed={feed} events={shownEvents} points={visiblePoints} filters={filters} now={now} onSelect={selectFromList} onHoverRoute={setHoveredRoute} />
    </Suspense>
  );

  return (
    <div className="app" data-kiosk={kiosk} data-idle={idle}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <Header
        connection={feed.connection}
        mode={mode}
        paused={paused}
        onPause={togglePause}
        view={view}
        onView={setView}
        reduced={motion.reduced}
        onMotion={motion.toggle}
        kiosk={kiosk}
        onKiosk={setKiosk}
      />
      <Notice mode={mode} />
      <LiveStatus spikes={spikes} />
      <main id="main" className="layout">
        <section className="stage" aria-label="Attack map">
          <StatusTiles status={status} spikes={spikes} corridors={visibleCorridors} now={now} />
          <FilterBar filters={filters} onChange={setFilters} />
          <div className="viewport" ref={viewportRef}>
            <ErrorBoundary fallback={<><Suspense fallback={null}>{flat}</Suspense><p className="map-note">3D needs WebGL, so this is the flat map. The same data is in the panels.</p></>}>
              <Suspense fallback={<p className="globe-message">Loading {view === 'map' ? 'map' : 'globe'}</p>}>
                {view === 'map' ? flat : (
                  <Globe
                    events={events}
                    threats={visiblePoints}
                    paused={paused}
                    filters={filters}
                    reducedMotion={motion.reduced}
                    highlight={highlight}
                    onHover={hoverOnMap}
                    onSelect={selectOnMap}
                    onTogglePause={togglePause}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
            {hover && <div className="hover-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">{hoverText(hover)}</div>}
            {selection && <Suspense fallback={null}><InfoCard item={selection} live={mode === 'live'} now={now} onClose={closeCard} /></Suspense>}
          </div>
          <Legend hasPoints={threats.total > 0} hasFlagged={threats.flagged > 0} />
          {narrow && !kiosk && (
            <button type="button" className="btn sheet-open" onClick={() => setSheet(true)}>Routes, sources and details</button>
          )}
        </section>
        {!narrow && (
          <aside className="sidebar" aria-label="Details">
            {panels}
          </aside>
        )}
      </main>
      {narrow && <Suspense fallback={null}><Sheet open={sheet} onClose={() => setSheet(false)} title="Details">{panels}</Sheet></Suspense>}
    </div>
  );
}
