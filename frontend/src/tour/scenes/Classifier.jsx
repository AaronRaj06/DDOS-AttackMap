import { useEffect, useMemo, useState } from 'react';
import { Mark } from '../../components/Legend';
import { scenes } from '../content';
import { NETWORKS, POINTS, THRESHOLD } from '../illustrative';
import { Caption, Scene } from '../parts';
import { pickNetworks, scoreOf } from '../score';

const copy = scenes.classifier;
const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`;

// With a trained model on the server: five real networks and their real explanations from
// GET /threats/{network}. Null until they arrive, or when there is no model to ask.
function useLiveNetworks(points, on) {
  const picks = useMemo(() => pickNetworks(points), [points]);
  const key = picks.map((p) => p.network).join(' ');
  const [found, setFound] = useState({ key: null, networks: null });

  useEffect(() => {
    if (!on || !picks.length || found.key === key) return undefined;
    const controller = new AbortController();
    Promise.all(picks.map((point) => fetch(`/threats/${encodeURIComponent(point.network)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => (body?.explanation ? { ...point, explanation: body.explanation, threshold: body.threshold } : null))
      .catch(() => null)))
      .then((list) => {
        if (!controller.signal.aborted) setFound({ key, networks: list.filter(Boolean) });
      });
    return () => controller.abort();
  }, [on, picks, key, found.key]);

  return found.key === key && found.networks?.length ? found.networks : null;
}

function Factors({ explanation }) {
  const rows = [...explanation.factors, { label: copy.other, contribution: explanation.other }];
  const max = Math.max(...rows.map((r) => Math.abs(r.contribution)), 0.01);
  return (
    <ul className="fig-factors" aria-label="What moved the score">
      {rows.map(({ label, contribution }) => (
        <li key={label}>
          <span className="fig-factor-name">{label}</span>
          <span className="fig-factor-track" aria-hidden="true">
            <span className={contribution >= 0 ? 'fig-bar up' : 'fig-bar down'} style={{ '--w': `${(Math.abs(contribution) / max) * 50}%` }} />
          </span>
          <span className="fig-factor-effect">{contribution >= 0 ? 'raises' : 'lowers'} {signed(contribution)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Classifier({ step, active, globe, feed }) {
  const on = active === step.id;
  const live = useLiveNetworks(feed.threats.points, on);
  const networks = useMemo(() => (live ?? NETWORKS).map((n) => {
    const score = scoreOf(n.explanation);
    return { ...n, score, flagged: score >= (n.threshold ?? THRESHOLD) };
  }).sort((a, b) => b.score - a.score), [live]);
  const [picked, setPicked] = useState(0);
  const selected = networks[Math.min(picked, networks.length - 1)];

  // Every reported network on the globe, the likely DoS sources as rings
  const points = useMemo(() => (live ? feed.threats.points : [...POINTS, ...networks.map(({ lat, lon, flagged }) => ({ lat, lon, flagged }))]),
    [live, feed.threats.points, networks]);

  useEffect(() => {
    if (!on) return undefined;
    const g = globe.current;
    g?.setThreats(points);
    return () => {
      g?.setThreats([]);
      g?.setHighlight(null);
    };
  }, [on, points, globe]);

  useEffect(() => {
    if (!on) return;
    globe.current?.setView({ lat: selected.lat, lon: selected.lon, zoom: 1.35 });
    globe.current?.setHighlight({ point: { lat: selected.lat, lon: selected.lon } });
  }, [on, selected.lat, selected.lon, globe]);

  const { explanation } = selected;

  return (
    <Scene id={step.id} active={active} className="tour-scene-pinned">
      <Caption id={step.id} heading={step.heading} source={live ? 'live' : 'illustrative'}>
        <p className="tour-question">{copy.question}</p>
        {!live && <p className="tour-note">{copy.untrained}</p>}
        <div className="tour-networks" role="group" aria-label={copy.networks}>
          {networks.map((n, i) => (
            <button key={n.network} type="button" className="btn" aria-pressed={n === selected} onClick={() => setPicked(i)}>
              <Mark shape={n.flagged ? 'ring' : 'disc'} color={n.flagged ? 'var(--data-flagged)' : 'var(--data-reported)'} />
              <span className="tour-network">{n.network}</span>
              <span className="tour-score">{Math.round(n.score * 100)}%</span>
            </button>
          ))}
        </div>
        <div className="tour-explain" aria-live="polite">
          <p>
            <code>{selected.network}</code> · score {Math.round(selected.score * 100)}% ·{' '}
            {selected.flagged ? `${copy.likely}, drawn as a ring` : `${copy.unlikely}, drawn as a disc`}
          </p>
          <Factors explanation={explanation} />
          <p className="tour-formula">
            sigmoid({signed(explanation.bias)} bias {explanation.factors.map((f) => signed(f.contribution)).join(' ')} {signed(explanation.other)} other) = {selected.score.toFixed(2)}
          </p>
          <p>{copy.verdict}</p>
        </div>
      </Caption>
    </Scene>
  );
}
