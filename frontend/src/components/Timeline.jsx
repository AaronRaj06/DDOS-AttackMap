import { useEffect, useMemo, useState } from 'react';
import { useRemote } from '../hooks/useRemote';
import { formatUtc, LAYER_LABELS, LAYER_SHORT, spikeSentence } from '../utils/labels';
import { SEVERITY } from '../utils/severity';
import { buildSparkline } from '../utils/sparkline';
import Icon from './Icon';
import { Skeleton } from './Skeleton';

const W = 600;
const H = 44;
const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1] || 1; };

function Chip({ status }) {
  const sev = SEVERITY[status ?? 'unavailable'];
  return <span className="chip-status" style={{ color: sev.color }}><Icon name={sev.icon} />{sev.label}</span>;
}

function Row({ layer, remote: { data, error, loading }, replay, onPick }) {
  const spark = useMemo(() => (data ? buildSparkline(data.points, { width: W, height: H }) : null), [data]);
  const spikes = data?.spikes ?? [];
  const playhead = replay && replay.layer === layer && spark ? spark.x(Date.parse(replay.point.t)) : null;

  return (
    <div className="tl-row" data-layer={layer}>
      <div className="tl-label">
        <span><span className="swatch" style={{ background: `var(--data-${layer})` }} aria-hidden="true" />{LAYER_SHORT[layer]}</span>
        {data && <Chip status={data.status} />}
      </div>
      <div className="tl-chart">
        {loading && <Skeleton height="2.75rem" />}
        {error && <p className="empty">{error}</p>}
        {data && !spark && <p className="empty">Not enough history yet.</p>}
        {spark && (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" style={{ '--layer': `var(--data-${layer})` }}
            aria-label={`${LAYER_LABELS[layer]} attack volume over the last ${Math.round((spark.t1 - spark.t0) / 3_600_000)} hours. ${spikes.length ? `${spikes.length} spike${spikes.length > 1 ? 's' : ''}, listed below.` : 'No spikes.'}`}>
            {spikes.map((spike) => {
              const x0 = spark.x(Date.parse(spike.start));
              const x1 = spike.end ? spark.x(Date.parse(spike.end)) : spark.x(spark.t1);
              const px = spark.x(Date.parse(spike.peakAt));
              return (
                <g key={spike.start} className="tl-spike" onClick={() => onPick(layer, spike)}>
                  <rect x={x0 - 2} y="0" width={Math.max(6, x1 - x0 + 4)} height={H} />
                  <polygon points={`${px - 5},${H - 2} ${px + 5},${H - 2} ${px},${H - 11}`} />
                </g>
              );
            })}
            <path className="tl-area" d={spark.area} />
            <path className="tl-line" d={spark.line} />
            {playhead !== null && <line className="tl-playhead" x1={playhead} x2={playhead} y1="0" y2={H} />}
          </svg>
        )}
      </div>
    </div>
  );
}

function Replay({ layer, spike, points, typical, reducedMotion, onIndex, index, onClose }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => onIndex((i) => {
      if (i >= points.length - 1) { setPlaying(false); return i; }
      return i + 1;
    }), 700);
    return () => clearInterval(timer);
  }, [playing, points.length, onIndex]);

  const point = points[index];
  return (
    <div className="replay" role="group" aria-label={`Replay of the ${LAYER_SHORT[layer]} spike`}>
      <p className="replay-title">{spikeSentence(spike)}</p>
      <div className="replay-controls">
        {!reducedMotion && (
          <button type="button" className="btn" aria-pressed={playing} onClick={() => { if (index >= points.length - 1) onIndex(0); setPlaying(!playing); }}>
            <Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pause replay' : 'Play replay'}
          </button>
        )}
        <label className="scrub">
          <span className="sr-only">Time within the spike</span>
          <input type="range" min="0" max={points.length - 1} value={index} onChange={(e) => { setPlaying(false); onIndex(Number(e.target.value)); }} />
        </label>
        <button type="button" className="btn quiet" onClick={onClose}><Icon name="close" />Close</button>
      </div>
      <p className="replay-readout" aria-live="off">
        <span className="mono">{formatUtc(point.t)}</span> · {(point.v / typical).toFixed(1)}x the 3-day median
      </p>
      <p className="note">Shows how much, and when. Radar's timeseries has no route data, so the map does not change.</p>
    </div>
  );
}

// Traffic over the last days, per layer, with spikes marked by a band and a triangle and listed as buttons
export default function Timeline({ status, spikes, now, reducedMotion }) {
  const live = status?.mode === 'live';
  // refetch every 5 minutes, and straight away when the spike state changes
  const refresh = `${Math.floor(now / 300_000)}:${spikes.status}:${spikes.active.length}`;
  const remotes = {
    l3: useRemote(live ? '/timeline?layer=l3&limit=300' : null, refresh),
    l7: useRemote(live ? '/timeline?layer=l7&limit=300' : null, refresh),
  };
  const [replay, setReplay] = useState(null); // { layer, spike, points }
  const [index, setIndex] = useState(0);

  function pick(layer, spike) {
    const all = remotes[layer].data?.points ?? [];
    const from = Date.parse(spike.start) - 3 * 900_000;
    const to = (spike.end ? Date.parse(spike.end) : Date.parse(all.at(-1)?.t)) + 3 * 900_000;
    const points = all.filter((p) => Date.parse(p.t) >= from && Date.parse(p.t) <= to);
    if (points.length < 2) return;
    // measured against the whole series, not the window, which holds the spike itself
    setReplay({ layer, spike, points, typical: median(all.map((p) => p.v)) });
    setIndex(0);
  }

  if (!status) return <section className="timeline" aria-label="Traffic timeline"><Skeleton height="5rem" /></section>;
  const listed = ['l3', 'l7']
    .flatMap((layer) => (remotes[layer].data?.spikes ?? []).map((spike) => ({ layer, spike })))
    .sort((a, b) => b.spike.start.localeCompare(a.spike.start))
    .slice(0, 6);

  return (
    <section className="timeline" aria-label="Traffic timeline">
      <div className="tl-head">
        <h2>Traffic, last 3 days</h2>
        <span className="note">{live ? 'Cloudflare Radar, 15-minute steps' : 'Needs a Cloudflare Radar token'}</span>
      </div>
      {live ? ['l3', 'l7'].map((layer) => (
        <Row key={layer} layer={layer} remote={remotes[layer]} onPick={pick} replay={replay && { layer: replay.layer, point: replay.points[index] }} />
      )) : <p className="empty">There is no timeline in demo mode, because spike detection needs real Radar history.</p>}
      {live && (
        <ul className="spike-list" aria-label="Spikes">
          {listed.length === 0 && <li className="empty">No spikes in this period.</li>}
          {listed.map(({ layer, spike }) => (
            <li key={`${layer}-${spike.start}`}>
              <button type="button" className="btn" onClick={() => pick(layer, spike)}>
                <Icon name="burst" />{LAYER_SHORT[layer]} {formatUtc(spike.start)}{spike.ratio ? `, ${spike.ratio}x` : ''}{spike.active ? ', running' : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {replay && <Replay {...replay} index={index} onIndex={setIndex} reducedMotion={reducedMotion} onClose={() => setReplay(null)} />}
    </section>
  );
}
