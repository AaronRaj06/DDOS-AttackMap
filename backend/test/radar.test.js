import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CloudflareRadarClient, parseDistribution, parsePairs, parseSeries, parseTargets, parseTrend, parseVectors,
} from '../services/cloudflareClient.js';
import { Intelligence } from '../services/intelligence.js';
import { SeriesStore } from '../services/seriesStore.js';
import { json, noGeo, silent, tempDir, testConfig } from './helpers.js';

// Shapes follow Cloudflare's published OpenAPI schema
const pair = (from, to, value = '4.32') => ({ originCountryAlpha2: from, targetCountryAlpha2: to, value });
const target = (code, value = '12.5') => ({ rank: 1, targetCountryAlpha2: code, targetCountryName: code, value });
const ok = (result) => json({ success: true, result });
const STEP = 15 * 60 * 1000;

// 100 flat points, then a surge on the last 4
function serie(surge = false) {
  const start = Date.now() - 100 * STEP;
  return {
    serie_0: {
      timestamps: Array.from({ length: 100 }, (_, i) => new Date(start + i * STEP).toISOString()),
      values: Array.from({ length: 100 }, (_, i) => String(surge && i >= 96 ? 900 : 100 + (i % 3))),
    },
  };
}

function radarFetch(url, { surge = false } = {}) {
  if (url.includes('/timeseries')) return ok(serie(surge));
  if (url.includes('/top/locations/target')) return ok({ top_0: [target('US')] });
  if (url.includes('/summary/VECTOR') && url.includes('7dcontrol')) {
    return ok({ summary_0: { 'SYN Flood': '40', 'DNS Flood': '20' }, summary_1: { 'SYN Flood': '30', 'UDP Flood': '10' } });
  }
  if (url.includes('/summary/DURATION')) return ok({ summary_0: { UNDER_10_MINS: '80', _10_20_MINS: '20' } });
  if (url.includes('/summary/BITRATE')) return ok({ summary_0: { UNDER_500_MBPS: '90', _500_MBPS_TO_1_GBPS: '10' } });
  if (url.includes('/summary/')) return ok({ summary_0: { 'SYN Flood': '40.5', 'DNS Flood': '20' } });
  if (url.includes('/layer3/')) return ok({ top_0: [pair('FR', 'US')] });
  return ok({ top_0: [pair('US', 'DE', '9.1')] });
}

const path = (url) => new URL(url).pathname.replace('/client/v4/radar/attacks', '');

test('requests documented endpoints, with the DDoS filter on layer 7 and the token only in a header', async () => {
  const calls = [];
  const client = new CloudflareRadarClient('secret-token', {
    fetch: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return radarFetch(url);
    },
  });
  const { errors, data } = await client.getTrends();

  assert.deepEqual(errors, []);
  assert.deepEqual(calls.map((c) => path(c.url)).sort(), [
    '/layer3/summary/BITRATE', '/layer3/summary/DURATION', '/layer3/summary/VECTOR', '/layer3/summary/VECTOR',
    '/layer3/timeseries', '/layer3/top/attacks', '/layer3/top/locations/target',
    '/layer7/timeseries', '/layer7/top/attacks', '/layer7/top/locations/target',
  ]);
  for (const { url, options } of calls) {
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    assert.ok(!url.href.includes('secret-token'));
  }
  // Layer 7 counts WAF and bot blocks too, unless filtered
  for (const call of calls.filter((c) => path(c.url).startsWith('/layer7'))) {
    assert.equal(call.url.searchParams.get('mitigationProduct'), 'DDOS', path(call.url));
  }
  for (const call of calls.filter((c) => path(c.url).startsWith('/layer3'))) {
    assert.equal(call.url.searchParams.get('mitigationProduct'), null, path(call.url));
  }
  const series = calls.find((c) => path(c.url) === '/layer3/timeseries').url.searchParams;
  assert.equal(series.get('aggInterval'), '15m');
  assert.equal(series.get('dateRange'), '2d');
  const trend = calls.find((c) => c.url.searchParams.getAll('dateRange').length === 2).url.searchParams;
  assert.deepEqual(trend.getAll('dateRange'), ['7d', '7dcontrol']);

  assert.equal(data.l7[0].dst.code, 'DE');
  assert.equal(data.seriesL3.length, 100);
  assert.equal(data.targetsL7[0].country.code, 'US');
  // ranked by size of change; the 10-point tie keeps Cloudflare's order
  assert.deepEqual(data.trend.map((row) => [row.name, row.change]), [['DNS Flood', 20], ['SYN Flood', 10], ['UDP Flood', -10]]);
});

test('never invents a target and drops malformed rows', () => {
  const rows = [
    pair('FR', 'US'),
    { originCountryAlpha2: 'FR', value: '4' },
    pair('XX', 'US'),
    pair('US', 'DE', 'NaN'),
    pair('US', 'DE', '0'),
    pair('__proto__', 'US'),
    pair('constructor', 'US'),
    null,
  ];
  const parsed = parsePairs({ top_0: rows }, 'l3');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].share, 4.32);
});

test('rejects unexpected response shapes', () => {
  assert.throws(() => parsePairs({}, 'l3'), /unexpected/);
  assert.throws(() => parseVectors(null), /unexpected/);
  assert.throws(() => parseDistribution({ summary_0: [] }), /unexpected/);
  assert.throws(() => parseTargets({ top_0: 'x' }, 'l3'), /unexpected/);
  assert.throws(() => parseTrend({ summary_0: {} }), /unexpected/);
  assert.throws(() => parseSeries({}, 'l3'), /unexpected/);
});

test('vectors are numeric and sorted', () => {
  assert.deepEqual(parseVectors({ summary_0: { a: '1', b: '30', c: 'x' } }),
    [{ name: 'b', share: 30 }, { name: 'a', share: 1 }]);
});

test('size buckets keep Cloudflare\'s order and drop empty or broken ones', () => {
  assert.deepEqual(parseDistribution({ summary_0: { UNDER_10_MINS: '80', _10_20_MINS: '20', _1_HOUR: '0', bad: 'x' } }),
    [{ name: 'UNDER_10_MINS', share: 80 }, { name: '_10_20_MINS', share: 20 }]);
});

test('targets come as a separate list and unknown countries are dropped', () => {
  const parsed = parseTargets({ top_0: [target('US', '5'), target('XX'), target('DE', 'nope'), { rank: 1 }] }, 'l3');
  assert.deepEqual(parsed.map((row) => [row.layer, row.country.code, row.share]), [['l3', 'US', 5]]);
  assert.ok(!('src' in parsed[0]) && !('dst' in parsed[0]), 'never an origin-to-target pair');
});

test('week-over-week change is in share points, includes new and vanished vectors, and is ranked by size', () => {
  const trend = parseTrend({
    summary_0: { A: '50', B: '10', NEW: '5' },
    summary_1: { A: '45', B: '30', GONE: '15', bad: 'x' },
  });
  assert.deepEqual(trend.map((row) => [row.name, row.change]), [['B', -20], ['GONE', -15], ['A', 5], ['NEW', 5]]);
  assert.equal(trend.find((row) => row.name === 'B').previous, 30);
});

test('series are parsed, sorted and cleaned', () => {
  const points = parseSeries({
    serie_0: {
      timestamps: ['2026-11-20T00:15:00Z', '2026-11-20T00:00:00Z', 'garbage', '2026-11-20T00:30:00Z', '2026-11-20T00:45:00Z'],
      values: ['2', '1', '3', null, ''],
    },
  }, 'l3');
  assert.deepEqual(points.map((p) => p.v), [1, 2]);
  assert.ok(points[0].t < points[1].t);
  assert.throws(() => parseSeries({ serie_0: { timestamps: ['2026-11-20T00:00:00Z'], values: ['1', '2'] } }, 'l3'), /unexpected/);
  assert.throws(() => parseSeries({ serie_0: { timestamps: ['x'], values: ['1'] } }, 'l3'), /unexpected/);
});

test('the series store merges windows and trims to its retention', () => {
  const store = new SeriesStore(60 * 60 * 1000);
  store.add('l3', [{ t: 0, v: 1 }, { t: 1000, v: 2 }]);
  store.add('l3', [{ t: 1000, v: 9 }, { t: 2 * 3600_000, v: 3 }, { t: NaN, v: 1 }]);
  assert.deepEqual(store.points('l3'), [{ t: 2 * 3600_000, v: 3 }]);
  assert.deepEqual(store.points('l7'), []);
});

function intelligenceFor(t, fetch, extra = {}) {
  return new Intelligence({
    config: testConfig(tempDir(t), { CLOUDFLARE_API_TOKEN: 'secret-token' }),
    geo: noGeo, model: null, log: silent, fetch, ...extra,
  });
}

test('goes live, then keeps the last data and says it is stale when Radar fails', async (t) => {
  let down = false;
  const intelligence = intelligenceFor(t, async (url) => (down ? json({}, 500) : radarFetch(url)));
  assert.equal(intelligence.status().mode, 'unavailable');
  assert.equal(intelligence.spikeSummary().status, 'unavailable');

  await intelligence.refreshRadar();
  assert.equal(intelligence.status().mode, 'live');
  assert.equal(intelligence.status().radar.state, 'ok');

  down = true;
  await intelligence.refreshRadar();
  assert.equal(intelligence.status().radar.state, 'stale');
  assert.equal(intelligence.routes.length, 2);
  assert.equal(intelligence.spikeSummary().status, 'normal');
});

test('one failing endpoint does not blank the others', async (t) => {
  const intelligence = intelligenceFor(t, async (url) => (url.includes('/layer3/top/attacks') ? json({}, 500) : radarFetch(url)));
  await intelligence.refreshRadar();
  assert.equal(intelligence.status().radar.state, 'partial');
  assert.deepEqual(intelligence.routes.map((route) => route.layer), ['l7']);
  assert.equal(intelligence.snapshot().targets.l3[0].country.code, 'US');
});

test('a bad target endpoint or a missing comparison series leaves the rest intact', async (t) => {
  const intelligence = intelligenceFor(t, async (url) => {
    if (url.includes('/top/locations/target')) return ok({ nope: true });
    if (url.includes('7dcontrol')) return ok({ summary_0: { A: '1' } });
    return radarFetch(url);
  });
  await intelligence.refreshRadar();
  const snapshot = intelligence.snapshot();
  assert.equal(intelligence.status().radar.state, 'partial');
  assert.deepEqual(snapshot.targets, { l3: [], l7: [] });
  assert.deepEqual(snapshot.trend, []);
  assert.equal(snapshot.sizes.duration.length, 2);
  assert.equal(snapshot.vectors.length, 2);
});

test('a surge in the series becomes an active spike in the snapshot, and a timeline', async (t) => {
  const changes = [];
  const intelligence = intelligenceFor(t, async (url) => radarFetch(url, { surge: true }), { onChange: () => changes.push(1) });
  await intelligence.refreshRadar();

  const { spikes } = intelligence.snapshot();
  assert.equal(spikes.status, 'spike');
  assert.deepEqual(spikes.active.map((s) => s.layer).sort(), ['l3', 'l7']);
  assert.ok(spikes.active[0].ratio > 5);

  const timeline = intelligence.timeline('l7', 10);
  assert.equal(timeline.points.length, 10);
  assert.equal(timeline.status, 'spike');
  assert.equal(timeline.spikes[0].active, true);
  assert.match(timeline.points[0].t, /^\d{4}-\d\d-\d\dT/);
  assert.ok(changes.length >= 1);
});

test('persisted history gives a restarted server a baseline at once', (t) => {
  const intelligence = intelligenceFor(t, async () => json({}, 500));
  const start = Date.now() - 100 * STEP;
  const points = Array.from({ length: 100 }, (_, i) => ({ t: start + i * STEP, v: i >= 98 ? 900 : 100 + (i % 3) }));
  intelligence.restoreSeries('l3', points);
  intelligence.restoreSeries('l7', []);
  assert.equal(intelligence.spikeSummary().status, 'spike');
  assert.equal(intelligence.timeline('l7', 5).points.length, 0);
});

test('a bad token never falls back to demo data or leaks', async (t) => {
  const intelligence = intelligenceFor(t, async () => json({ errors: ['secret-token is invalid'] }, 403));
  await intelligence.refreshRadar();
  const status = intelligence.status();
  assert.equal(status.mode, 'unavailable');
  assert.equal(intelligence.routes.length, 0);
  assert.equal(status.radar.error, 'Cloudflare Radar returned HTTP 403. Check the API key');
  assert.ok(!JSON.stringify(intelligence.snapshot()).includes('secret-token'));
});
