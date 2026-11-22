import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createService } from '../app.js';
import { train } from '../ml/classifier.js';
import { dataset } from './fixtures.js';
import { json, noGeo, silent, tempDir, testConfig } from './helpers.js';

async function boot(t, env, { setup, ...options } = {}) {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<title>map</title>');
  const config = testConfig(dir, env);
  setup?.(config);
  const service = await createService(config, { log: silent, ...options });
  service.server.listen(0, '127.0.0.1');
  await once(service.server, 'listening');
  await service.start();
  t.after(() => service.stop());
  const host = `127.0.0.1:${service.server.address().port}`;
  return { host, get: (path, init) => fetch(`http://${host}${path}`, { redirect: 'manual', ...init }) };
}

function connect(host, headers = {}) {
  const socket = new WebSocket(`ws://${host}/ws`, { headers });
  return new Promise((resolve) => {
    socket.once('message', (data) => resolve({ socket, first: JSON.parse(data) }));
    socket.once('error', (error) => resolve({ error: error.message }));
  });
}

test('serves every endpoint in demo mode', async (t) => {
  const { get } = await boot(t);
  await sleep(50);

  assert.equal((await (await get('/health')).json()).mode, 'demo');
  const { events } = await (await get('/events')).json();
  assert.equal(events[0].source, 'demo');
  assert.ok((await (await get('/stats')).json()).events.total >= 1);
  assert.deepEqual((await (await get('/threats')).json()).threats, []);

  const csv = await get('/export?limit=5');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert.match(await csv.text(), /^Event ID,Replayed At,Source/);
});

test('rejects bad limits', async (t) => {
  const { get } = await boot(t);
  for (const query of ['0', '-1', '1001', '1e2', 'abc', '', '5&limit=6', '99999999999']) {
    for (const path of ['events', 'export', 'threats']) {
      assert.equal((await get(`/${path}?limit=${query}`)).status, 400, `${path} ${query}`);
    }
  }
});

test('sets security headers and no wildcard CORS', async (t) => {
  const { headers } = await (await boot(t)).get('/');
  assert.match(headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('access-control-allow-origin'), null);
  assert.equal(headers.get('x-powered-by'), null);
});

test('serves the app, redirects old pages and hides everything else', async (t) => {
  const { get } = await boot(t);
  assert.equal((await get('/')).status, 200);
  for (const path of ['/login', '/signup', '/dashboard']) assert.equal((await get(path)).status, 302);
  for (const path of ['/.env', '/..%2f..%2f.env', '/missing']) assert.ok([403, 404, 400].includes((await get(path)).status));
  const broken = await get('/%E0%A4%A');
  assert.ok(broken.status < 500);
  assert.ok(!(await broken.text()).includes('node_modules'));
});

test('rate limits the API but not the health check', async (t) => {
  const { get } = await boot(t);
  const statuses = [];
  for (let i = 0; i < 121; i++) statuses.push((await get('/stats')).status);
  assert.equal(statuses[119], 200);
  assert.equal(statuses[120], 429);
  assert.equal((await get('/health')).status, 200);
});

test('a WebSocket gets a snapshot, then events', async (t) => {
  const { host } = await boot(t);
  const { socket, first } = await connect(host, { origin: `http://${host}` });
  assert.equal(first.type, 'snapshot');
  assert.equal(first.data.status.mode, 'demo');
  const [next] = await once(socket, 'message');
  assert.equal(JSON.parse(next).type, 'event');
});

test('a WebSocket from another site is refused unless allowed', async (t) => {
  const { host } = await boot(t, { ALLOWED_ORIGINS: 'https://friend.example' });
  assert.match((await connect(host, { origin: 'https://evil.example' })).error, /403/);
  assert.match((await connect(host, { origin: 'null' })).error, /403/);
  assert.ok((await connect(host, { origin: 'https://friend.example' })).first);
});

test('caps connections per address, and frees them on close', async (t) => {
  const { host } = await boot(t);
  const open = [];
  for (let i = 0; i < 20; i++) open.push((await connect(host)).socket);
  assert.match((await connect(host)).error, /429/);
  open[0].close();
  await once(open[0], 'close');
  await sleep(50);
  assert.ok((await connect(host)).first);
});

test('an oversized client message does not crash the server', async (t) => {
  const { host, get } = await boot(t);
  const { socket } = await connect(host);
  socket.send('x'.repeat(5000));
  await once(socket, 'close');
  assert.equal((await get('/health')).status, 200);
});

test('live mode replays Radar data end to end', async (t) => {
  const row = { originCountryAlpha2: 'JP', targetCountryAlpha2: 'BR', value: '12' };
  const { get } = await boot(t, { CLOUDFLARE_API_TOKEN: 'test' }, {
    fetch: async (url) => json({ success: true, result: url.includes('/summary/') ? { summary_0: {} } : { top_0: [row] } }),
  });
  await sleep(1400);
  const { events } = await (await get('/events')).json();
  assert.ok(events.length);
  assert.ok(events.every((e) => e.source === 'radar' && e.src_country === 'JP' && e.dst_country === 'BR'));
});

test('timeline: validates its input, and is honest in demo mode', async (t) => {
  const { get } = await boot(t);
  for (const query of ['', '?layer=l9', '?layer=', '?layer=l3&layer=l7', '?layer=l3&limit=0', '?layer=l3&limit=1001', '?layer=l3&limit=x']) {
    assert.equal((await get(`/timeline${query}`)).status, 400, query);
  }
  const body = await (await get('/timeline?layer=l3')).json();
  assert.deepEqual([body.status, body.points, body.spikes], ['unavailable', [], []]);
});

test('timeline and the WebSocket both report a surge from Radar', async (t) => {
  const step = 15 * 60 * 1000;
  const start = Date.now() - 100 * step;
  const serie = {
    serie_0: {
      timestamps: Array.from({ length: 100 }, (_, i) => new Date(start + i * step).toISOString()),
      values: Array.from({ length: 100 }, (_, i) => String(i >= 97 ? 5000 : 100 + (i % 4))),
    },
  };
  const { host, get } = await boot(t, { CLOUDFLARE_API_TOKEN: 'test' }, {
    fetch: async (url) => json({ success: true, result: url.includes('/timeseries') ? serie : { top_0: [] } }),
  });
  await sleep(1200);

  const body = await (await get('/timeline?layer=l7&limit=5')).json();
  assert.equal(body.points.length, 5);
  assert.equal(body.status, 'spike');
  assert.equal(body.spikes[0].active, true);

  const { first } = await connect(host, { origin: `http://${host}` });
  assert.equal(first.data.spikes.status, 'spike');
  assert.deepEqual(first.data.spikes.active.map((s) => s.layer).sort(), ['l3', 'l7']);
  assert.ok(Array.isArray(first.data.targets.l3) && Array.isArray(first.data.sizes.duration));
});

test('timeline shares the API rate limit', async (t) => {
  const { get } = await boot(t);
  const statuses = [];
  for (let i = 0; i < 121; i++) statuses.push((await get('/timeline?layer=l3')).status);
  assert.equal(statuses[120], 429);
});

// A blacklist already on disk (next refresh far in the future, so nothing is fetched) and a trained model
const seed = (config) => writeFileSync(config.paths.blacklist, JSON.stringify({
  generatedAt: new Date().toISOString(),
  nextAttempt: Date.now() + 1e9,
  entries: [
    { ip: '30.1.2.3', country: 'US', reportedAt: new Date().toISOString() },
    { ip: '30.1.2.77', country: 'US', reportedAt: new Date(Date.now() - 3600_000).toISOString() },
    { ip: '150.9.9.9', country: 'DE', reportedAt: new Date().toISOString() },
    { ip: '2a00:1450:4001::5', country: 'DE', reportedAt: new Date().toISOString() },
  ],
}));
const modelGeo = { ...noGeo, hasASN: true, locate: (ip, c) => ({ ...noGeo.locate(ip, c), asn: 101, org: ip.startsWith('30.') ? 'Example Hosting' : 'Example Net' }) };
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const keys = { ABUSEIPDB_KEY: 'test' };

test('a flagged network explains itself, with exact arithmetic and no addresses', async (t) => {
  const { get } = await boot(t, keys, { setup: seed, geo: modelGeo, model: train(dataset()) });
  const body = await (await get(`/threats/${encodeURIComponent('30.1.2.0/24')}`)).json();
  assert.equal(body.success, true);
  assert.equal(body.network, '30.1.2.0/24');
  assert.equal(body.flagged, true);
  assert.equal(body.explanation.factors.length, 3);
  assert.equal(body.explanation.factors[0].feature, 'hosting');

  const { bias, factors, other } = body.explanation;
  const total = bias + factors.reduce((sum, f) => sum + f.contribution, 0) + other;
  assert.ok(Math.abs(sigmoid(total) - body.dosScore) < 1e-12);

  const text = JSON.stringify(body);
  for (const ip of ['30.1.2.3', '30.1.2.77']) assert.ok(!text.includes(ip), `leaked ${ip}`);
  // two listed IPs share this network, so the more suspicious one speaks for it
  assert.equal(body.reportedAt != null, true);
});

test('the slash in a network may be encoded or plain, and IPv6 works', async (t) => {
  const { get } = await boot(t, keys, { setup: seed, geo: modelGeo, model: train(dataset()) });
  const a = await (await get('/threats/30.1.2.0%2F24')).json();
  const b = await (await get('/threats/30.1.2.0/24')).json();
  assert.deepEqual(a, b);
  const v6 = await (await get(`/threats/${encodeURIComponent('2a00:1450:4001::/48')}`)).json();
  assert.equal(v6.network, '2a00:1450:4001::/48');
  assert.equal((await get('/threats/2a00:1450:4001::/48')).status, 200);
});

test('unknown networks are 404, malformed ones are 400', async (t) => {
  const { get } = await boot(t, keys, { setup: seed, geo: modelGeo, model: train(dataset()) });
  assert.equal((await get('/threats/30.9.9.0%2F24')).status, 404);
  assert.equal((await get('/threats/2a00:1450:4002::/48')).status, 404);
  const bad = ['999.1.1.0/24', '30.1.2.0/25', '30.1.2.5/24', '30.1.2.0', '30.1.2/24', '2001:db8::/32', '2001:DB8:1::/48',
    '2001:0db8:1::/48', '30.01.2.0/24', 'abc', '../../etc/passwd', '30.1.2.0/24/extra', '%00', 'a'.repeat(200)];
  for (const raw of bad) {
    const response = await get(`/threats/${encodeURIComponent(raw)}`);
    assert.equal(response.status, 400, raw);
    assert.ok(!(await response.text()).includes('passwd'));
  }
});

test('without a model a network is still described, just not scored', async (t) => {
  const { get } = await boot(t, keys, { setup: seed, geo: noGeo });
  const body = await (await get('/threats/30.1.2.0%2F24')).json();
  assert.deepEqual([body.dosScore, body.flagged, body.explanation], [null, false, null]);
});

test('explanations are rate limited with the rest of /threats', async (t) => {
  const { get } = await boot(t, keys, { setup: seed });
  const statuses = [];
  for (let i = 0; i < 121; i++) statuses.push((await get('/threats/30.9.9.0%2F24')).status);
  assert.equal(statuses[119], 404);
  assert.equal(statuses[120], 429);
});

test('the 1,000-dot payload carries no reasons, and /health carries the model card', async (t) => {
  const { get } = await boot(t, keys, { setup: seed, geo: modelGeo, model: train(dataset()) });
  const { threats } = await (await get('/threats?limit=10')).json();
  assert.ok(threats.length > 0);
  for (const threat of threats) {
    assert.deepEqual(Object.keys(threat).sort(), ['country', 'dosScore', 'flagged', 'lat', 'lon', 'network', 'precise', 'reportedAt']);
  }
  const health = await (await get('/health')).json();
  assert.equal(health.classifier.state, 'active');
  assert.ok(health.classifier.trainedAt && health.classifier.samples.test > 0 && health.classifier.metrics.precision >= 0);
  assert.ok(!JSON.stringify(health).includes('weights'), 'the model itself stays private');
});

const lookupGeo = {
  ...modelGeo,
  hasCity: true,
  locate: (ip, country) => ({
    country: country ?? 'US', lat: 40.7128, lon: -74.006, precise: true, city: 'New York',
    asn: 101, org: ip.startsWith('30.') ? 'Example Hosting' : 'Example Net',
  }),
};
const lookupBoot = (t, over = {}) => boot(t, keys, { setup: seed, geo: lookupGeo, model: train(dataset()), ...over });
const lookup = async (get, ip) => (await get(`/lookup?ip=${encodeURIComponent(ip)}`)).json();

test('lookup: location, ASN and a score for a public IPv4 and IPv6 address', async (t) => {
  const { get } = await lookupBoot(t);
  const v4 = await lookup(get, '150.50.5.5');
  assert.deepEqual([v4.success, v4.country, v4.countryName, v4.city, v4.asn, v4.org], [true, 'US', 'United States', 'New York', 101, 'Example Net']);
  assert.deepEqual([v4.lat, v4.lon, v4.network], [40.71, -74.01, '150.50.5.0/24']);
  assert.equal(typeof v4.classifier.score, 'number');
  assert.equal(v4.classifier.state, 'active');

  const v6 = await lookup(get, '2606:4700:4700::1111');
  assert.equal(v6.network, '2606:4700:4700::/48');
  assert.equal(v6.success, true);
});

test('lookup says whether the /24 or /48 is listed, and never whether the exact IP is', async (t) => {
  const { get } = await lookupBoot(t);
  // 30.1.2.3 is on the blacklist, 30.1.2.200 is not, but they share a /24
  const exact = await lookup(get, '30.1.2.3');
  const neighbour = await lookup(get, '30.1.2.200');
  assert.equal(exact.networkListed, true);
  assert.deepEqual({ ...exact, ip: null }, { ...neighbour, ip: null }, 'identical answers: nothing finer than the /24 leaks');
  assert.equal(exact.classifier.basis, 'listed_network');

  assert.equal((await lookup(get, '30.7.7.7')).networkListed, false);
  assert.equal((await lookup(get, '2a00:1450:4001::99')).networkListed, true);
  assert.equal((await lookup(get, '2a00:1450:4002::99')).networkListed, false);
  for (const body of [exact, neighbour]) assert.ok(!Object.keys(body).some((key) => /listed|member|blacklist/i.test(key) && key !== 'networkListed'));
});

test('an unlisted IP is scored with the average report age, and says so', async (t) => {
  const model = train(dataset());
  const { get } = await lookupBoot(t, { model });
  const body = await lookup(get, '30.7.7.7');
  assert.equal(body.classifier.basis, 'neutral_age');
  assert.equal(body.classifier.flagged, body.classifier.score >= model.threshold);
  const { score, neutralAgeHours } = await import('../ml/classifier.js');
  const expected = score(model, { ip: '30.7.7.7', country: 'US', asn: 101, org: 'Example Hosting', ageHours: neutralAgeHours(model) });
  assert.ok(Math.abs(body.classifier.score - expected) < 1e-12);
});

test('lookup without a model or location data still answers, honestly', async (t) => {
  const { get } = await boot(t, keys, { setup: seed, geo: noGeo });
  const body = await lookup(get, '150.50.5.5');
  assert.deepEqual([body.success, body.country, body.city, body.lat, body.asn, body.classifier.score, body.classifier.state],
    [true, null, null, 10, null, null, 'untrained']);
});

test('lookup rejects anything that is not exactly one IP address', async (t) => {
  const { get } = await lookupBoot(t);
  const bad = ['', 'abc', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', ' 8.8.8.8', '8.8.8.8 ', '8.8.8.8/32', 'fe80::1%eth0',
    '2606:4700:4700::1111%lo0', 'a'.repeat(60), '8.8.8.8,1.1.1.1', '8.8.8.8\n1.1.1.1', '<script>', '../etc/passwd'];
  for (const ip of bad) {
    const response = await get(`/lookup?ip=${encodeURIComponent(ip)}`);
    assert.equal(response.status, 400, JSON.stringify(ip));
    const text = await response.text();
    assert.match(text, /valid IPv4 or IPv6/);
    assert.ok(!text.includes('script') && !text.includes('passwd'), 'input is never echoed on error');
  }
  assert.equal((await get('/lookup')).status, 400);
  assert.equal((await get('/lookup?ip=8.8.8.8&ip=1.1.1.1')).status, 400);
  assert.equal((await get('/lookup?ip[]=8.8.8.8')).status, 400);
});

test('lookup refuses private, reserved and loopback addresses with a clear message', async (t) => {
  const { get } = await lookupBoot(t);
  const private_ = ['10.0.0.1', '127.0.0.1', '192.168.1.1', '172.16.5.5', '169.254.169.254', '0.0.0.0', '255.255.255.255', '224.0.0.1',
    '100.64.0.1', '203.0.113.5', '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1'];
  for (const ip of private_) {
    const response = await get(`/lookup?ip=${encodeURIComponent(ip)}`);
    assert.equal(response.status, 400, ip);
    assert.match((await response.json()).error, /private, reserved or loopback/, ip);
  }
});

test('lookup allows 30 a minute, separately from the rest of the API', async (t) => {
  const { get } = await lookupBoot(t);
  const statuses = [];
  for (let i = 0; i < 31; i++) statuses.push((await get('/lookup?ip=8.8.8.8')).status);
  assert.deepEqual([statuses[29], statuses[30]], [200, 429]);
  assert.equal((await get('/events')).status, 200, 'other endpoints have their own allowance');
  assert.equal((await get('/health')).status, 200);
  // rejected input counts too, or it would be a free way to hammer the endpoint
  assert.equal((await get('/lookup?ip=nope')).status, 429);
});

test('lookup is offline: it never calls AbuseIPDB or Radar', async (t) => {
  let calls = 0;
  const { get } = await lookupBoot(t, { fetch: async () => { calls++; return json({}, 500); } });
  for (const ip of ['30.1.2.3', '8.8.8.8', '2606:4700:4700::1111']) await lookup(get, ip);
  assert.equal(calls, 0);
});
