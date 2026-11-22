import { Suspense, lazy, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';
import { LAYERS, POINT_COLORS } from '../utils/layers';
import './Dashboard.css';

const Globe = lazy(() => import('../components/Globe'));

const CONNECTION = { connecting: 'Connecting', connected: 'Connected', reconnecting: 'Reconnecting' };
const MODE = { demo: 'Demo data', live: 'Radar trends', unavailable: 'No data' };
const SOURCE = {
  ok: 'OK',
  partial: 'Partly updated',
  stale: 'Out of date',
  error: 'Failing',
  loading: 'Loading',
  not_configured: 'No API key',
};
const CLASSIFIER = { active: 'Active', untrained: 'Not trained', needs_geo_database: 'Needs ASN database' };

function modeNotice({ mode, radar }) {
  if (mode === 'demo') {
    return 'Demo mode: these routes are made up for illustration. Add a Cloudflare API token to show real trends.';
  }
  if (mode === 'unavailable') {
    return radar.state === 'loading'
      ? 'Loading Cloudflare Radar trends.'
      : `No Radar routes to show. ${radar.error ?? 'Radar returned none.'}`;
  }
  const caveat = radar.state === 'ok' ? '' : ' Some of this data is out of date.';
  return `Replayed from Cloudflare Radar's last 24 hours. Each arc is a sample of a country-level trend, not a single live attack.${caveat}`;
}

function Dot({ color }) {
  return <span className="dot" style={{ backgroundColor: color }} aria-hidden="true" />;
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { connection, status, events, received, corridors, vectors, threats } = useWebSocket('/ws');
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState([]);

  function togglePause() {
    setFrozen(events);
    setPaused(!paused);
  }

  const recent = (paused ? frozen : events).slice(-6).reverse();

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Global DoS Attack Map</h1>
        <div className="header-controls">
          <span className={`badge ${connection}`} role="status">{CONNECTION[connection]}</span>
          {status && <span className={`badge mode-${status.mode}`}>{MODE[status.mode]}</span>}
          <button className="control" type="button" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
          <a className="control" href="/export?limit=1000" download>Export CSV</a>
        </div>
      </header>

      {status && <p className={`notice mode-${status.mode}`}>{modeNotice(status)}</p>}

      <main className="dashboard-main">
        <div className="globe-wrapper">
          <ErrorBoundary fallback={<p className="globe-message">The 3D globe needs WebGL. The data is still listed in the panels.</p>}>
            <Suspense fallback={<p className="globe-message">Loading globe</p>}>
              <Globe events={events} threats={threats.points} paused={paused} />
            </Suspense>
          </ErrorBoundary>
          <ul className="legend" aria-label="Legend">
            {Object.entries(LAYERS).map(([key, { label, color }]) => (
              <li key={key}><Dot color={color} />{label}</li>
            ))}
            {threats.total > 0 && <li><Dot color={POINT_COLORS.reported} />Reported abusive IP</li>}
            {threats.flagged > 0 && <li><Dot color={POINT_COLORS.flagged} />Likely DoS source</li>}
          </ul>
        </div>

        <div className="sidebar">
          <dl className="stats">
            <div>
              <dt>Arcs this visit</dt>
              <dd>{received.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Abusive IPs</dt>
              <dd>{status?.abuse.updatedAt ? threats.total.toLocaleString() : '–'}</dd>
            </div>
            <div>
              <dt>Likely DoS</dt>
              <dd>{status?.classifier.state === 'active' ? threats.flagged.toLocaleString() : '–'}</dd>
            </div>
          </dl>

          <Panel title={status?.mode === 'demo' ? 'Top routes (demo)' : 'Top routes, last 24 hours'}>
            {Object.entries(LAYERS).map(([layer, { label, color }]) => {
              const rows = corridors.filter((route) => route.layer === layer).slice(0, 5);
              return (
                <div className="route-group" key={layer}>
                  <h3><Dot color={color} />{label}</h3>
                  {rows.length ? (
                    <ol>
                      {rows.map(({ src, dst, share }) => (
                        <li key={`${src.code}-${dst.code}`}>
                          <span>{src.name} → {dst.name}</span>
                          {status?.mode === 'live' && <b>{share.toFixed(1)}%</b>}
                        </li>
                      ))}
                    </ol>
                  ) : <p className="empty">No country pairs available.</p>}
                </div>
              );
            })}
          </Panel>

          {vectors.length > 0 && (
            <Panel title="Network attack vectors">
              <ul>
                {vectors.map(({ name, share }) => (
                  <li key={name}><span>{name}</span><b>{share.toFixed(1)}%</b></li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Recently drawn">
            {recent.length ? (
              <ul>
                {recent.map((event) => (
                  <li key={event.id}>
                    <span><Dot color={LAYERS[event.layer].color} />{event.src_name} → {event.dst_name}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="empty">Waiting for data.</p>}
          </Panel>

          {status && (
            <Panel title="Data sources">
              <ul>
                <li><span>Cloudflare Radar</span><b>{SOURCE[status.radar.state]}</b></li>
                <li><span>AbuseIPDB</span><b>{SOURCE[status.abuse.state]}</b></li>
                <li><span>IP location</span><b>{status.geo === 'city' ? 'City level' : 'Country level'}</b></li>
                <li><span>DoS classifier</span><b>{CLASSIFIER[status.classifier.state]}</b></li>
              </ul>
            </Panel>
          )}

          <footer className="credits">
            <p>Network-layer origins are where Cloudflare received the traffic, because source IPs can be spoofed.</p>
            <p>
              Data: <a href="https://radar.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare Radar</a>{' '}
              (<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">CC BY-NC 4.0</a>),{' '}
              <a href="https://www.abuseipdb.com/" target="_blank" rel="noreferrer">AbuseIPDB</a>,{' '}
              <a href="https://db-ip.com/" target="_blank" rel="noreferrer">IP geolocation by DB-IP</a>, Natural Earth.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
