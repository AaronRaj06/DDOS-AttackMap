import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CloudflareRadarClient, parsePairs, parseVectors } from '../services/cloudflareClient.js';
import { Intelligence } from '../services/intelligence.js';
import { json, noGeo, silent, tempDir, testConfig } from './helpers.js';

// Shapes follow Cloudflare's published OpenAPI schema
const pair = (from, to, value = '4.32') => ({ originCountryAlpha2: from, targetCountryAlpha2: to, value });
const ok = (result) => json({ success: true, result });

function radarFetch(url) {
  if (url.includes('/summary/')) return ok({ summary_0: { 'SYN Flood': '40.5', 'DNS Flood': '20' } });
  if (url.includes('/layer3/')) return ok({ top_0: [pair('FR', 'US')] });
  return ok({ top_0: [pair('US', 'DE', '9.1')] });
}

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
  assert.deepEqual(calls.map((c) => c.url.pathname.replace('/client/v4/radar/attacks', '')).sort(),
    ['/layer3/summary/VECTOR', '/layer3/top/attacks', '/layer7/top/attacks']);
  for (const { url, options } of calls) {
    assert.equal(url.searchParams.get('dateRange'), '1d');
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    assert.ok(!url.href.includes('secret-token'));
  }
  const l7 = calls.find((c) => c.url.pathname.includes('layer7'));
  assert.equal(l7.url.searchParams.get('mitigationProduct'), 'DDOS');
  assert.equal(data.l7[0].dst.code, 'DE');
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
});

test('vectors are numeric and sorted', () => {
  assert.deepEqual(parseVectors({ summary_0: { a: '1', b: '30', c: 'x' } }),
    [{ name: 'b', share: 30 }, { name: 'a', share: 1 }]);
});

test('goes live, then keeps the last data and says it is stale when Radar fails', async (t) => {
  let down = false;
  const intelligence = new Intelligence({
    config: testConfig(tempDir(t), { CLOUDFLARE_API_TOKEN: 'secret-token' }),
    geo: noGeo, model: null, log: silent,
    fetch: async (url) => (down ? json({}, 500) : radarFetch(url)),
  });
  assert.equal(intelligence.status().mode, 'unavailable');

  await intelligence.refreshRadar();
  assert.equal(intelligence.status().mode, 'live');
  assert.equal(intelligence.status().radar.state, 'ok');

  down = true;
  await intelligence.refreshRadar();
  assert.equal(intelligence.status().radar.state, 'stale');
  assert.equal(intelligence.routes.length, 2);
});

test('one failing endpoint does not blank the others', async (t) => {
  const intelligence = new Intelligence({
    config: testConfig(tempDir(t), { CLOUDFLARE_API_TOKEN: 'x' }),
    geo: noGeo, model: null, log: silent,
    fetch: async (url) => (url.includes('/layer3/top') ? json({}, 500) : radarFetch(url)),
  });
  await intelligence.refreshRadar();
  assert.equal(intelligence.status().radar.state, 'partial');
  assert.deepEqual(intelligence.routes.map((route) => route.layer), ['l7']);
});

test('a bad token never falls back to demo data or leaks', async (t) => {
  const intelligence = new Intelligence({
    config: testConfig(tempDir(t), { CLOUDFLARE_API_TOKEN: 'secret-token' }),
    geo: noGeo, model: null, log: silent,
    fetch: async () => json({ errors: ['secret-token is invalid'] }, 403),
  });
  await intelligence.refreshRadar();
  const status = intelligence.status();
  assert.equal(status.mode, 'unavailable');
  assert.equal(intelligence.routes.length, 0);
  assert.equal(status.radar.error, 'Cloudflare Radar returned HTTP 403. Check the API key');
  assert.ok(!JSON.stringify(intelligence.snapshot()).includes('secret-token'));
});
