import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatAge } from '../utils/age';
import { createGlobe } from '../utils/globeScene';
import { intro, steps } from './content';
import Abuse from './scenes/Abuse';
import Built from './scenes/Built';
import Classifier from './scenes/Classifier';
import Hero from './scenes/Hero';
import Invented from './scenes/Invented';
import Live from './scenes/Live';
import Radar from './scenes/Radar';
import Separate from './scenes/Separate';
import Spikes from './scenes/Spikes';

// Where the camera looks in each scene. `zoom` is relative to the whole-globe framing.
// The hero and the last scene use the dashboard's opening view, so the hand-off to / lines up.
// Scenes that move the camera themselves (the radar origin, AbuseIPDB, the classifier) are not listed.
const OPENING = { lat: 24, lon: -30, zoom: 1 };
const VIEWS = {
  top: OPENING,
  invented: { lat: 15, lon: 20, zoom: 0.85 },
  radar: { lat: 38, lon: -10, zoom: 1.05 },
  separate: { lat: 30, lon: -35, zoom: 0.72 },
  spikes: { lat: 16, lon: 55, zoom: 0.85 }, // turned toward the recent end of the ribbon
  built: { lat: 30, lon: 100, zoom: 1 },
  live: OPENING,
};

const pipeline = steps.filter((step) => step.nav);

// The whole page's data, from the same WebSocket snapshot the dashboard reads. Each scene also
// carries its own badge, because one can be live while another is illustrative.
function DataBadge({ feed }) {
  const { status, connection } = feed;
  let text = 'checking data…';
  let live = false;
  if (status) {
    live = status.mode === 'live';
    text = live ? `live · Radar updated ${formatAge(status.radar?.updatedAt)}` : 'illustrative';
  } else if (connection === 'reconnecting') {
    text = 'illustrative';
  }
  return (
    <p className="tour-badge" data-live={live} title={live ? 'Scenes use the data this server has now' : 'No live data here: scenes use built-in examples'}>
      <span className="tour-badge-dot" aria-hidden="true" />{text}
    </p>
  );
}

// Which section holds the middle of the viewport. One scroll listener, at most once a frame.
function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight / 2) current = id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);
  return active;
}

// A scene's second beat gets its own stretch of scroll but stays the same step in the bar
const BEATS = { radar: ['origin'], spikes: ['outputs'] };
const SECTION_IDS = ['top', ...steps.flatMap((step) => [step.id, ...(BEATS[step.id] ?? [])])];
const SCENES = {
  invented: Invented, radar: Radar, abuse: Abuse, classifier: Classifier, separate: Separate, spikes: Spikes, built: Built, live: Live,
};

// The step a section belongs to: the last pipeline step at or before it
function currentStep(active) {
  const at = SECTION_IDS.indexOf(active);
  return pipeline.findLast((step) => SECTION_IDS.indexOf(step.id) <= at) ?? null;
}

export default function Stage({ motion }) {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const active = useActiveSection(SECTION_IDS);
  const socket = useWebSocket('/ws');
  // At most 2,000 dots (800 on a phone). The server lists likely DoS sources first, so those stay.
  const phone = useMediaQuery('(max-width: 40rem)');
  const limit = phone ? 800 : 2000;
  const points = useMemo(() => socket.threats.points.slice(0, limit), [socket.threats.points, limit]);
  const feed = useMemo(() => ({ ...socket, threats: { ...socket.threats, points } }), [socket, points]);
  const [ready, setReady] = useState(false);
  const latest = useRef({});
  useEffect(() => { latest.current = { reduced: motion.reduced }; });

  // Created once; motion changes go through setReducedMotion below
  useEffect(() => {
    const globe = createGlobe(mountRef.current, {
      reducedMotion: latest.current.reduced, interactive: false, intro: true, maxPixelRatio: 1.5, onLoad: () => setReady(true),
    });
    globeRef.current = globe;
    return () => globe.dispose();
  }, []);
  useEffect(() => globeRef.current.setReducedMotion(motion.reduced), [motion.reduced]);
  useEffect(() => {
    if (VIEWS[active]) globeRef.current.setView(VIEWS[active]);
  }, [active]);

  const step = currentStep(active);
  const index = pipeline.indexOf(step);

  return (
    <div className="tour3d">
      <a className="skip-link" href="#top">Skip to content</a>
      <header className="tour-header tour3d-header">
        <span className="tour-brand">{intro.title}</span>
        <nav className="tour-pipeline" aria-label="Tour steps">
          <ol>
            {pipeline.map((step) => (
              <li key={step.id}>
                <a href={`#${step.id}`} aria-current={step === currentStep(active) ? 'step' : undefined}>{step.nav}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="tour-tools">
          <DataBadge feed={feed} />
          <button type="button" className="btn quiet" aria-label="Reduce motion" aria-pressed={motion.reduced} onClick={motion.toggle}>
            <Icon name="motion" /><span className="tour-wide-only">Reduce motion</span>
          </button>
          <a className="btn" href="/">{intro.liveMap} →</a>
        </div>
      </header>
      <p className="sr-only" aria-live="polite">{step ? `Step ${index + 1} of ${pipeline.length}: ${step.nav}` : ''}</p>

      <div className="tour-stage" ref={mountRef} aria-hidden="true" />

      <main className="tour-scenes">
        <Hero active={active} ready={ready} />
        {steps.map((step) => {
          const Scene = SCENES[step.id];
          return <Scene key={step.id} step={step} active={active} globe={globeRef} feed={feed} reduced={motion.reduced} />;
        })}
      </main>
    </div>
  );
}
