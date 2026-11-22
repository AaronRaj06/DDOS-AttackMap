import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, detect, layerStatus, median, robustZ, summarize } from '../services/spikes.js';

const STEP = 15 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 20);
const at = (i) => T0 + i * STEP;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

// 96 points (a day) of 100 with 5% noise, then whatever `shape` returns
function series(shape, { seed = 3, base = 96, total = 120 } = {}) {
  const r = rng(seed);
  return Array.from({ length: total }, (_, i) => ({ t: at(i), v: (i < base ? 100 : shape(i - base, r)) * (1 + 0.05 * gauss(r)) }));
}

test('median and robust z-score match hand-worked numbers', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  // median 3, MAD 1, so scale 1.4826
  const { z, center } = robustZ(6, [1, 2, 3, 4, 5]);
  assert.equal(center, 3);
  assert.ok(Math.abs(z - 3 / 1.4826) < 1e-9);
});

test('one big outlier at the end is an active spike', () => {
  const result = detect(series((i) => (i === 23 ? 1000 : 100)));
  assert.equal(result.spikes.length, 1);
  assert.equal(result.spikes[0].end, null);
  assert.equal(result.spikes[0].start, at(119));
  assert.ok(result.spikes[0].peakZ > DEFAULTS.extremeZ);
  assert.equal(layerStatus(result), 'spike');
});

test('a one-point outlier followed by normal data is a closed spike', () => {
  const result = detect(series((i) => (i === 5 ? 1000 : 100)));
  assert.equal(result.spikes.length, 1);
  assert.equal(result.spikes[0].start, at(101));
  assert.equal(result.spikes[0].end, at(101));
  assert.equal(layerStatus(result), 'normal');
});

test('a plateau is one spike from its first to last point, and the baseline is not poisoned', () => {
  const result = detect(series((i) => (i >= 4 && i < 16 ? 300 : 100)));
  assert.equal(result.spikes.length, 1);
  const [spike] = result.spikes;
  assert.equal(spike.start, at(100));
  assert.equal(spike.end, at(111));
  assert.ok(spike.ratio > 2.7 && spike.ratio < 3.3, `ratio ${spike.ratio}`);
});

test('a single moderate point is not confirmed, but shows as elevated', () => {
  // about 1.18x against ~7% effective noise: z between the exit and enter thresholds
  const result = detect(series((i) => (i === 23 ? 118 : 100), { seed: 5 }));
  assert.equal(result.spikes.length, 0);
  assert.ok(result.latestZ >= DEFAULTS.exitZ && result.latestZ < DEFAULTS.enterZ, `z ${result.latestZ}`);
  assert.equal(layerStatus(result), 'elevated');
});

test('a spike that is still running when the data ends is active', () => {
  const result = detect(series((i) => (i >= 20 ? 400 : 100)));
  assert.equal(result.spikes.at(-1).end, null);
  assert.equal(summarize({ l3: result, l7: null }).active.length, 1);
});

test('hysteresis: a wobble inside a spike does not end it', () => {
  // dips to 3x, which is still far above the exit threshold
  const wobble = [400, 400, 300, 400, 300, 400, 400, 100];
  const result = detect(series((i) => wobble[i] ?? 100, { total: 96 + 12 }));
  assert.equal(result.spikes.length, 1);
  assert.equal(result.spikes[0].end, at(96 + 6));
});

test('flat data never alarms and never divides by zero', () => {
  const flat = Array.from({ length: 200 }, (_, i) => ({ t: at(i), v: 10 }));
  const result = detect(flat);
  assert.deepEqual(result.spikes, []);
  assert.ok(Number.isFinite(result.latestZ));
  assert.equal(result.latestZ, 0);

  const jitter = flat.map((p, i) => ({ ...p, v: 10 + (i % 2 ? 0.05 : -0.05) }));
  assert.deepEqual(detect(jitter).spikes, []);
});

test('a jump on flat data is still a spike', () => {
  const data = Array.from({ length: 120 }, (_, i) => ({ t: at(i), v: i >= 110 ? 20 : 10 }));
  assert.equal(detect(data).spikes.length, 1);
});

test('all-zero data stays quiet, and the first activity after it is a spike', () => {
  const zeros = Array.from({ length: 120 }, (_, i) => ({ t: at(i), v: i >= 115 ? 5 : 0 }));
  const result = detect(zeros);
  assert.ok(result.spikes.length === 1 && Number.isFinite(result.spikes[0].peakZ));
  assert.deepEqual(detect(zeros.slice(0, 100)).spikes, []);
});

test('too little history means no verdict, not a guess', () => {
  const short = series(() => 1000, { base: 0, total: 20 });
  const result = detect(short);
  assert.deepEqual(result.spikes, []);
  assert.equal(result.evaluated, 0);
  assert.equal(layerStatus(result), 'unavailable');
  assert.equal(layerStatus(null), 'unavailable');
  assert.deepEqual(detect([]).spikes, []);
});

test('a gap in normal data is harmless', () => {
  const data = series(() => 100, { total: 160 }).filter((_, i) => i < 110 || i >= 150);
  const result = detect(data);
  assert.deepEqual(result.spikes, []);
  assert.ok(result.evaluated > 0);
});

test('a spike is still found after a gap', () => {
  const data = series((i) => (i >= 40 ? 500 : 100), { total: 160 }).filter((_, i) => i < 110 || i >= 140);
  const result = detect(data);
  assert.equal(result.spikes.length, 1);
  assert.equal(result.spikes[0].start, at(140));
});

test('a gap closes a running spike at its last point', () => {
  const data = series((i) => (i >= 4 ? 500 : 100), { total: 160 }).filter((_, i) => i < 106 || i >= 150);
  const [spike] = detect(data).spikes;
  assert.equal(spike.end, at(105));
});

test('a gap longer than the baseline window leaves nothing to compare with', () => {
  const data = series(() => 100, { total: 96 + 40 }).filter((_, i) => i < 100 || i >= 100 + 4 * 96);
  assert.equal(detect(data).evaluated > 0, true);
  const lonely = [...series(() => 100, { total: 30 }), { t: at(30 + 4 * 96), v: 9999 }];
  assert.equal(detect(lonely).spikes.length, 0);
});

test('unsorted, duplicate and bad points are cleaned', () => {
  const good = series((i) => (i >= 4 ? 500 : 100));
  const messy = [...good].reverse().concat([{ t: NaN, v: 1 }, { t: at(1), v: Infinity }, null, { t: at(2), v: undefined }]);
  assert.deepEqual(detect(messy).spikes.map((s) => s.start), detect(good).spikes.map((s) => s.start));
});

// The detector is only worth having if it stays quiet on ordinary data.
test('noisy but normal data never alarms: gaussian, seasonal and skewed, 300 seeds each', () => {
  const noise = {
    gaussian: (r) => 100 * (1 + 0.15 * gauss(r)),
    seasonal: (r, i) => 100 * (1 + 0.25 * Math.sin((2 * Math.PI * i) / 96) + 0.1 * gauss(r)),
    skewed: (r) => 100 * Math.exp(0.3 * gauss(r)),
  };
  for (const [name, make] of Object.entries(noise)) {
    let alarms = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const data = Array.from({ length: 288 }, (_, i) => ({ t: at(i), v: Math.max(0, make(r, i)) }));
      alarms += detect(data).spikes.length;
    }
    assert.equal(alarms, 0, `${name}: ${alarms} false alarms`);
  }
});

test('and it catches a real surge in the same kind of data', () => {
  let caught = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const r = rng(seed);
    const data = Array.from({ length: 288 }, (_, i) => ({ t: at(i), v: 100 * Math.exp(0.2 * gauss(r)) * (i >= 200 && i < 208 ? 3 : 1) }));
    caught += detect(data).spikes.length === 1 ? 1 : 0;
  }
  assert.ok(caught >= 49, `caught ${caught} of 50`);
});

test('summaries rank the worst layer and ignore unavailable ones', () => {
  const quiet = detect(series(() => 100));
  const loud = detect(series((i) => (i >= 20 ? 500 : 100)));
  assert.equal(summarize({ l3: null, l7: null }).status, 'unavailable');
  assert.equal(summarize({ l3: null, l7: quiet }).status, 'normal');
  const both = summarize({ l3: quiet, l7: loud });
  assert.equal(both.status, 'spike');
  assert.deepEqual(both.active.map((s) => s.layer), ['l7']);
  assert.match(both.active[0].start, /^2026-11-2\dT/);
});
