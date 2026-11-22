// Robust z-score spike detection with hysteresis, on a log scale.
// Traffic noise is multiplicative, so raw values are right-skewed and a plain z-score false-alarms
// on ordinary bursts (3% to 21% of simulated days). Logs make it symmetric, and make the scale
// floor mean "a 5% change" whatever the unit.
// Starting values, tuned in test/spikes.test.js: a spike needs two points at z >= 3.5 in a row
// (or one at z >= 6), and lasts until z falls under 2.
export const DEFAULTS = Object.freeze({
  enterZ: 3.5,
  exitZ: 2,
  extremeZ: 6,
  confirm: 2,
  minPoints: 24,
  windowMs: 24 * 3600_000,
  gapFactor: 3,
  minScale: 0.05,
});

const RANK = { unavailable: 0, normal: 1, elevated: 2, spike: 3 };

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function robustZ(value, baseline, minScale = DEFAULTS.minScale) {
  const center = median(baseline);
  const mad = median(baseline.map((v) => Math.abs(v - center)));
  // MAD is 0 for flat data, so floor the scale or any wobble becomes infinite
  const scale = Math.max(1.4826 * mad, minScale);
  return { z: (value - center) / scale, center };
}

function clean(points) {
  const byTime = new Map();
  for (const point of points) if (Number.isFinite(point?.t) && Number.isFinite(point?.v)) byTime.set(point.t, point.v);
  return [...byTime].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

// shortcut: a spike keeps the baseline from just before it started, so a level shift that never
// ends stays a spike until retention (3 days) trims it. Upgrade if that proves noisy.
export function detect(points, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const raw = clean(points);
  // The offset keeps zeros finite and is small next to typical values
  const positives = raw.filter((p) => p.v > 0).map((p) => p.v);
  const offset = positives.length ? 0.01 * median(positives) : 1e-9;
  const pts = raw.map(({ t, v }) => ({ t, v, x: Math.log(v + offset) }));
  const step = pts.length > 1 ? median(pts.slice(1).map((p, i) => p.t - pts[i].t)) : 900_000;
  const flagged = new Array(pts.length).fill(false); // flagged points stay out of later baselines
  const spikes = [];
  let open = null;
  let pending = [];
  let latestZ = null;
  let evaluated = 0;

  const close = (lastIndex) => {
    open.end = pts[lastIndex].t;
    spikes.push(open);
    open = null;
  };
  const drop = () => {
    for (const { i } of pending) flagged[i] = false;
    pending = [];
  };

  for (let i = 0; i < pts.length; i++) {
    latestZ = null;
    if (i > 0 && pts[i].t - pts[i - 1].t > o.gapFactor * step) {
      if (open) close(i - 1);
      drop();
    }

    if (open) {
      const { z } = robustZ(pts[i].x, open.frozen, o.minScale);
      latestZ = z;
      evaluated++;
      if (z >= o.exitZ) {
        flagged[i] = true;
        if (z > open.peakZ) Object.assign(open, { peakZ: z, peakAt: pts[i].t, peakValue: pts[i].v });
      } else {
        close(i - 1);
      }
      continue;
    }

    const baseline = [];
    for (let j = i - 1; j >= 0 && pts[i].t - pts[j].t <= o.windowMs; j--) if (!flagged[j]) baseline.push(pts[j].x);
    if (baseline.length < o.minPoints) {
      drop();
      continue;
    }

    const { z, center } = robustZ(pts[i].x, baseline, o.minScale);
    latestZ = z;
    evaluated++;
    if (z < o.enterZ) {
      drop();
      continue;
    }

    pending.push({ i, z });
    flagged[i] = true;
    if (pending.length >= o.confirm || z >= o.extremeZ) {
      const peak = pending.reduce((best, p) => (p.z > best.z ? p : best));
      open = {
        start: pts[pending[0].i].t,
        end: null,
        peakZ: peak.z,
        peakAt: pts[peak.i].t,
        peakValue: pts[peak.i].v,
        baseline: Math.exp(center) - offset,
        frozen: baseline,
      };
      pending = [];
    }
  }
  if (open) spikes.push(open);

  return {
    spikes: spikes.map(({ frozen, ...spike }) => ({ ...spike, ratio: spike.baseline > 0 ? spike.peakValue / spike.baseline : null })),
    latestZ,
    evaluated,
  };
}

export function layerStatus(result, o = DEFAULTS) {
  if (!result || result.evaluated === 0) return 'unavailable';
  if (result.spikes.some((spike) => spike.end === null)) return 'spike';
  return result.latestZ !== null && result.latestZ >= o.exitZ ? 'elevated' : 'normal';
}

const iso = (ms) => new Date(ms).toISOString();

export function serializeSpike(layer, spike) {
  return {
    layer,
    start: iso(spike.start),
    end: spike.end === null ? null : iso(spike.end),
    active: spike.end === null,
    peakAt: iso(spike.peakAt),
    peakZ: Number(spike.peakZ.toFixed(1)),
    ratio: spike.ratio === null ? null : Number(spike.ratio.toFixed(1)),
  };
}

export function summarize(results) {
  const layers = Object.entries(results);
  const status = layers.reduce((worst, [, result]) => {
    const next = layerStatus(result);
    return RANK[next] > RANK[worst] ? next : worst;
  }, 'unavailable');
  const active = layers
    .flatMap(([layer, result]) => (result?.spikes ?? []).filter((s) => s.end === null).map((s) => serializeSpike(layer, s)))
    .sort((a, b) => a.start.localeCompare(b.start));
  return { status, active };
}
