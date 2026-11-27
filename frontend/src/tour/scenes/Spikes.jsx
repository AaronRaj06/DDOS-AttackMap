import { useEffect, useRef, useState } from 'react';
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial,
} from 'three';
import { toXYZ } from '../../utils/geo';
import { cssColor } from '../../utils/layers';
import { formatUtc, LAYER_LABELS } from '../../utils/labels';
import { outputExamples, scenes } from '../content';
import { TIMELINE } from '../illustrative';
import { Caption, Scene } from '../parts';

const copy = scenes.spikes;
const RADIUS = 1.25; // the ribbon stands just outside the globe
const SPAN = 75; // degrees of longitude either side of the centre
const REPLAY_SECONDS = 4;

// A layer's series and its detected spikes, straight from GET /timeline. Prefers a layer with a spike.
function useTimeline(live, on) {
  const [found, setFound] = useState(null);
  useEffect(() => {
    if (!on || !live || found) return undefined;
    const controller = new AbortController();
    const get = (layer) => fetch(`/timeline?layer=${layer}&limit=1000`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([get('l3'), get('l7')]).then((both) => {
      if (controller.signal.aborted) return;
      const usable = both.filter((t) => t && t.status !== 'unavailable' && t.points.length >= 24);
      setFound(usable.find((t) => t.spikes.length) ?? usable[0] ?? 'none');
    });
    return () => controller.abort();
  }, [on, live, found]);
  return found && found !== 'none' ? found : null;
}

// The series as a ribbon around the equator: height is volume. The detector's typical level is a dashed
// line over the 24 hours before each spike, and each spike's stretch is shaded.
function buildRibbon({ points, spikes }) {
  const n = points.length;
  const values = points.map((p) => p.v);
  const max = Math.max(...values, 1);
  const height = (v) => 0.03 + 0.45 * (v / max);
  const times = points.map((p) => Date.parse(p.t));
  const lonAt = (i) => -SPAN + (2 * SPAN * i) / Math.max(n - 1, 1);
  const base = (i) => toXYZ(0, lonAt(i), RADIUS);
  const top = (i, v = values[i]) => { const [x, , z] = base(i); return [x, height(v), z]; };
  const indexOf = (iso) => times.findIndex((t) => t >= Date.parse(iso));

  const strip = (from, to, color, opacity) => {
    const vertices = [];
    const index = [];
    for (let i = from; i <= to; i++) {
      vertices.push(...base(i), ...top(i));
      if (i > from) {
        const k = (i - from) * 2;
        index.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(index);
    return new Mesh(geometry, new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false }));
  };
  const line = (pts, material) => new Line(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts.flat(), 3)), material);

  const group = new Group();
  const fill = strip(0, n - 1, cssColor('--text-3'), 0.12);
  const series = line(points.map((_, i) => top(i)), new LineBasicMaterial({ color: cssColor('--text-1') }));
  group.add(fill, series);

  const marks = spikes.map((spike) => {
    const start = Math.max(indexOf(spike.start), 0);
    const end = spike.end ? Math.max(indexOf(spike.end), start) : n - 1;
    const mark = new Group();
    mark.add(strip(start, end, cssColor('--sev-spike'), 0.45));
    if (spike.baseline != null) {
      const from = Math.max(times.findIndex((t) => t >= times[start] - 24 * 3600_000), 0);
      const level = [];
      for (let i = from; i <= end; i++) level.push(top(i, spike.baseline));
      const dashed = line(level, new LineDashedMaterial({ color: cssColor('--sev-normal'), dashSize: 0.02, gapSize: 0.015 }));
      dashed.computeLineDistances();
      mark.add(dashed);
    }
    group.add(mark);
    return { mark, start };
  });

  // Replay: draw the series up to point k, and show each spike once the replay reaches it
  const show = (k) => {
    series.geometry.setDrawRange(0, k);
    fill.geometry.setDrawRange(0, Math.max(k - 1, 0) * 6);
    for (const { mark, start } of marks) mark.visible = k > start;
  };
  return { group, show, count: n };
}

export default function Spikes({ step, active, globe, feed, reduced }) {
  const on = active === step.id || active === 'outputs';
  const live = useTimeline(feed.status?.mode === 'live', on);
  const timeline = live ?? TIMELINE;
  const [replaying, setReplaying] = useState(false);
  const ribbon = useRef(null);
  const run = useRef(0);

  useEffect(() => {
    if (!on) return undefined;
    const g = globe.current;
    if (!g) return undefined;
    ribbon.current = buildRibbon(timeline);
    ribbon.current.show(ribbon.current.count);
    const remove = g.add(ribbon.current.group);
    return () => {
      cancelAnimationFrame(run.current);
      remove();
      ribbon.current = null;
      setReplaying(false);
    };
  }, [on, timeline, globe]);

  function replay() {
    const r = ribbon.current;
    if (!r) return;
    cancelAnimationFrame(run.current);
    if (reduced) {
      r.show(r.count);
      return;
    }
    setReplaying(true);
    const began = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - began) / (REPLAY_SECONDS * 1000));
      r.show(Math.max(2, Math.round(t * r.count)));
      if (t < 1) run.current = requestAnimationFrame(frame);
      else setReplaying(false);
    };
    run.current = requestAnimationFrame(frame);
  }

  const spike = timeline.spikes.at(-1);
  const source = live ? 'live' : 'illustrative';

  return (
    <>
      <Scene id={step.id} active={active}>
        <Caption id={step.id} heading={step.heading} source={source}>
          <p className="tour-tick">{copy.layer(LAYER_LABELS[timeline.layer], 3)}</p>
          <p>{step.body[0]}</p>
          <ul className="tour-key">
            <li><span className="tour-key-level" aria-hidden="true" />Dashed line: {copy.normal}</li>
            <li><span className="tour-key-spike" aria-hidden="true" />Shaded: {spike ? `${copy.spike(spike.ratio)}, peak z ${spike.peakZ}, from ${formatUtc(spike.start)}` : copy.none}</li>
          </ul>
          <button type="button" className="btn" onClick={replay} disabled={replaying}>{replaying ? copy.replaying : copy.replay}</button>
          <ul className="tour-points">{step.points.map((text) => <li key={text}>{text}</li>)}</ul>
        </Caption>
      </Scene>
      <Scene id="outputs" active={active}>
        <Caption id="outputs" heading={scenes.outputsHeading}>
          <dl className="tour-outputs">
            {step.outputs.map(({ name, detail }) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{detail}</dd>
                <dd><pre><code>{outputExamples[name]}</code></pre></dd>
              </div>
            ))}
          </dl>
        </Caption>
      </Scene>
    </>
  );
}
