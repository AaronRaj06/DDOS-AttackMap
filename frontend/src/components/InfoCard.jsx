import { useEffect, useRef } from 'react';
import { useRemote } from '../hooks/useRemote';
import { formatAge } from '../utils/age';
import { countryName } from '../utils/filters';
import { formatContribution, formatShare, formatUtc, LAYER_LABELS } from '../utils/labels';
import { routeFromEvent } from '../utils/routes';
import Icon from './Icon';
import { SkeletonRows } from './Skeleton';

function RouteDetails({ route, live, drawnAt, now }) {
  return (
    <>
      <h3 tabIndex={-1} data-card-title>{route.src.name} → {route.dst.name}</h3>
      <dl className="facts">
        <div><dt>Layer</dt><dd><span className="swatch" style={{ background: `var(--data-${route.layer})` }} aria-hidden="true" />{LAYER_LABELS[route.layer]}</dd></div>
        <div><dt>Share of that layer</dt><dd>{live ? `${formatShare(route.share)} over the last 24 hours` : 'Not meaningful in demo mode'}</dd></div>
        {drawnAt && <div><dt>Drawn</dt><dd>{formatAge(drawnAt, now)}</dd></div>}
      </dl>
      <p className="note">{live ? 'A sample of a country-level trend from Cloudflare Radar, not a single attack.' : 'Illustrative demo route. Not real traffic.'}</p>
    </>
  );
}

function NetworkDetails({ point }) {
  const { data, error, loading } = useRemote(`/threats/${encodeURIComponent(point.network)}`);
  return (
    <>
      <h3 tabIndex={-1} data-card-title className="mono">{point.network}</h3>
      <dl className="facts">
        <div><dt>Country</dt><dd>{countryName(point.country)}{point.precise ? '' : ' (country level)'}</dd></div>
        {point.reportedAt && <div><dt>Last reported</dt><dd>{formatUtc(point.reportedAt)}</dd></div>}
        <div>
          <dt>Classifier</dt>
          <dd>
            {point.dosScore == null ? 'Not trained' : (
              <span className={point.flagged ? 'tone-bad' : ''}>
                <Icon name={point.flagged ? 'burst' : 'check'} />
                {point.flagged ? 'Likely DoS source' : 'Not flagged'}, score {point.dosScore.toFixed(2)}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {loading && <SkeletonRows rows={3} label="Loading explanation" />}
      {error && <p className="note" role="alert">Could not load the explanation: {error}</p>}
      {data && (
        <>
          {data.asn != null && <p className="note">AS{data.asn} {data.org}</p>}
          {data.explanation ? (
            <>
              <h4>Why this score</h4>
              <ul className="factors">
                {data.explanation.factors.map((factor) => (
                  <li key={factor.feature}>
                    <Icon name={factor.direction === 'raises' ? 'up' : 'down'} />
                    <span>{factor.label}</span>
                    <b>{factor.direction} {formatContribution(factor.contribution)}</b>
                  </li>
                ))}
              </ul>
              <p className="note">Factors are weight times value. They add up, with the rest and a baseline, to the score.</p>
            </>
          ) : <p className="note">Train the classifier to see which factors drive a score.</p>}
        </>
      )}
      <p className="note">Reported to AbuseIPDB for abuse of any kind. Location is approximate.</p>
    </>
  );
}

// One card for every way of picking something: a click on the map, or a row in a list.
export default function InfoCard({ item, live, now, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    // Keyboard users arrive from a list row, so move focus to the card. Pointer clicks leave focus alone.
    if (item.focus) ref.current?.querySelector('[data-card-title]')?.focus();
  }, [item]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const route = item.kind === 'route' ? item.route : item.kind === 'arc' ? routeFromEvent(item.event) : null;
  return (
    <section ref={ref} className="info-card" aria-label="Details">
      <button type="button" className="btn quiet icon-only close" aria-label="Close details" onClick={onClose}><Icon name="close" /></button>
      {route ? <RouteDetails route={route} live={live} drawnAt={item.kind === 'arc' ? item.event.ts : null} now={now} /> : <NetworkDetails point={item.point} />}
    </section>
  );
}
