import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createService } from '../app.js';
import { json, silent, tempDir, testConfig } from './helpers.js';

async function boot(t, env, options = {}) {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<title>map</title>');
  const service = await createService(testConfig(dir, env), { log: silent, ...options });
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
