import { formatAge } from '../utils/age';
import { matchesEvent, matchesRoute } from '../utils/filters';
import { formatShare, LAYER_LABELS } from '../utils/labels';
import { SOURCE_STATE } from '../utils/severity';
import Icon from './Icon';
import Panel from './Panel';
import { SkeletonRows } from './Skeleton';

const TONE_ICON = { ok: 'check', warn: 'triangle', bad: 'burst', none: 'dash' };

function SourceState({ state }) {
  const { label, tone } = SOURCE_STATE[state] ?? SOURCE_STATE.error;
  return <span className={`state tone-${tone}`}><Icon name={TONE_ICON[tone]} />{label}</span>;
}

function RoutesPanel({ feed, filters, onSelect, onHoverRoute }) {
  const live = feed.status.mode === 'live';
  return (
    <Panel id="routes" title={live ? 'Top routes, last 24 hours' : 'Top routes (demo)'}>
      {Object.entries(LAYER_LABELS).map(([layer, label]) => {
        const rows = feed.corridors.filter((route) => route.layer === layer && matchesRoute(filters, route)).slice(0, 5);
        return (
          <div className="group" key={layer}>
            <h3><span className="swatch" style={{ background: `var(--data-${layer})` }} aria-hidden="true" />{label}</h3>
            {rows.length ? (
              <ol className="rows">
                {rows.map((route) => (
                  <li key={`${route.src.code}-${route.dst.code}`}>
                    <button
                      type="button"
                      className="row"
                      onClick={() => onSelect({ kind: 'route', route })}
                      onPointerEnter={() => onHoverRoute(route)}
                      onPointerLeave={() => onHoverRoute(null)}
                      onFocus={() => onHoverRoute(route)}
                      onBlur={() => onHoverRoute(null)}
                    >
                      <span>{route.src.name} → {route.dst.name}</span>
                      {live && <b>{formatShare(route.share)}</b>}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">
                {layer === 'l3' && live ? 'Radar lists no origin-to-target pairs for this layer.' : 'Nothing matches the filters.'}
              </p>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function RecentPanel({ events, filters, onSelect }) {
  const rows = events.filter((event) => matchesEvent(filters, event)).slice(-6).reverse();
  return (
    <Panel id="recent" title="Recently drawn">
      {rows.length ? (
        <ul className="rows">
          {rows.map((event) => (
            <li key={event.id}>
              <button type="button" className="row" onClick={() => onSelect({ kind: 'arc', event })}>
                <span><span className="swatch" style={{ background: `var(--data-${event.layer})` }} aria-hidden="true" />{event.src_name} → {event.dst_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="empty">Nothing drawn yet that matches the filters.</p>}
    </Panel>
  );
}

// The map's dots, as a list: every point you can click on the map can be reached here
function NetworksPanel({ points, onSelect }) {
  const rows = points.slice(0, 8);
  const scored = rows.some((point) => point.dosScore != null);
  return (
    <Panel id="networks" title={scored ? 'Likely DoS sources' : 'Latest reported networks'}>
      {rows.length ? (
        <ul className="rows">
          {rows.map((point) => (
            <li key={point.network}>
              <button type="button" className="row" onClick={() => onSelect({ kind: 'network', point })}>
                <span><span className="mono">{point.network}</span> <span className="code">{point.country}</span></span>
                {point.dosScore != null && <b>{point.dosScore.toFixed(2)}</b>}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="empty">No abusive-IP data matches the filters.</p>}
    </Panel>
  );
}

function SourcesPanel({ status, now }) {
  const rows = [
    ['Cloudflare Radar', status.radar.state, status.radar.updatedAt, status.radar.error],
    ['AbuseIPDB blacklist', status.abuse.state, status.abuse.updatedAt, status.abuse.error],
  ];
  return (
    <Panel id="sources" title="Data sources">
      <ul className="sources">
        {rows.map(([name, state, updatedAt, error]) => (
          <li key={name}>
            <span className="source-name">{name}</span>
            <SourceState state={state} />
            <span className="age">{updatedAt ? `updated ${formatAge(updatedAt, now)}` : 'no update yet'}</span>
            {error && <span className="source-error">{error}</span>}
          </li>
        ))}
        <li>
          <span className="source-name">IP location</span>
          <span className="state tone-none"><Icon name="dash" />{status.geo === 'city' ? 'City level' : 'Country level'}</span>
        </li>
      </ul>
    </Panel>
  );
}

export default function Panels({ feed, events, points, filters, now, onSelect, onHoverRoute }) {
  if (!feed.status) return <SkeletonRows rows={5} label="Loading details" />;
  return (
    <>
      <RoutesPanel feed={feed} filters={filters} onSelect={onSelect} onHoverRoute={onHoverRoute} />
      <RecentPanel events={events} filters={filters} onSelect={onSelect} />
      {feed.threats.total > 0 && <NetworksPanel points={points} onSelect={onSelect} />}
      <SourcesPanel status={feed.status} now={now} />
      <footer className="credits">
        <p>Network-layer origins are where Cloudflare received the traffic, because source IPs can be spoofed.</p>
        <p>
          Data: <a href="https://radar.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare Radar</a> (<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">CC BY-NC 4.0</a>),{' '}
          <a href="https://www.abuseipdb.com/" target="_blank" rel="noreferrer">AbuseIPDB</a>,{' '}
          <a href="https://db-ip.com/" target="_blank" rel="noreferrer">IP geolocation by DB-IP</a>, Natural Earth.
        </p>
      </footer>
    </>
  );
}
