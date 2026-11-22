import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../config/index.js';
import { Notifier, formatSpike, spikeKey } from '../services/alerts.js';
import { Intelligence } from '../services/intelligence.js';
import { json, noGeo, tempDir, testConfig } from './helpers.js';

const SECRET = 'T0K3N-s3cret-path';
const spike = (over = {}) => ({ layer: 'l7', start: '2026-11-23T10:15:00.000Z', end: null, active: true, peakAt: '2026-11-23T10:30:00.000Z', peakZ: 7.2, ratio: 3.4, ...over });

// A real HTTP server on a random port. `respond(request, hits)` decides what it answers.
async function receiver(t, respond = (req, res) => res.end('ok')) {
  const hits = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, headers: req.headers, body });
      respond(req, res, hits);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { hits, url: `http://127.0.0.1:${server.address().port}/hooks/${SECRET}` };
}

function logs() {
  const lines = [];
  return { lines, info: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
}

const make = (url, over = {}) => new Notifier({ url, retryDelayMs: 0, log: logs(), ...over });

test('posts a Slack-compatible {text} that names the layer and size, and nothing sensitive', async (t) => {
  const { url, hits } = await receiver(t);
  await make(url).consider([spike()]);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].method, 'POST');
  assert.match(hits[0].headers['content-type'], /application\/json/);
  const body = JSON.parse(hits[0].body);
  assert.deepEqual(Object.keys(body), ['text']);
  assert.match(body.text, /Application layer \(L7\)/);
  assert.match(body.text, /about 3\.4x/);
  assert.match(body.text, /since 2026-11-23 10:15 UTC/);
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(body.text), 'no IP-like text');
  assert.ok(!body.text.includes(SECRET) && !body.text.includes('127.0.0.1'));
  assert.equal(formatSpike(spike({ ratio: null })).includes('far above'), true);
});

test('one send per spike, however often it is reported', async (t) => {
  const { url, hits } = await receiver(t);
  const notifier = make(url, { cooldownMs: 0 });
  for (let i = 0; i < 5; i++) await notifier.consider([spike()]);
  assert.equal(hits.length, 1);
  await notifier.consider([spike(), spike({ layer: 'l3' })]);
  assert.equal(hits.length, 2, 'a different spike is a different alert');
  assert.notEqual(spikeKey(spike()), spikeKey(spike({ layer: 'l3' })));
});

test('30-minute cooldown: a second spike waits, then is announced if it is still running', async (t) => {
  const { url, hits } = await receiver(t);
  let now = 1_000_000;
  const notifier = make(url, { now: () => now });
  const a = spike();
  const b = spike({ layer: 'l3', start: '2026-11-23T10:20:00.000Z' });

  await notifier.consider([a]);
  now += 10 * 60_000;
  await notifier.consider([a, b]);
  assert.equal(hits.length, 1, 'held back by the cooldown');
  now += 19 * 60_000;
  await notifier.consider([a, b]);
  assert.equal(hits.length, 1, '29 minutes is still inside it');
  now += 60_000;
  await notifier.consider([a, b]);
  assert.equal(hits.length, 2);
  assert.match(JSON.parse(hits[1].body).text, /Network layer/);
});

test('a spike that ends during the cooldown is never announced', async (t) => {
  const { url, hits } = await receiver(t);
  let now = 0;
  const notifier = make(url, { now: () => now });
  await notifier.consider([spike()]);
  now += 60_000;
  await notifier.consider([spike({ layer: 'l3' })]);
  now += 40 * 60_000;
  await notifier.consider([]);
  assert.equal(hits.length, 1);
});

test('redirects are not followed, and the target is never contacted', async (t) => {
  const target = await receiver(t);
  const redirecting = await receiver(t, (req, res) => { res.statusCode = 302; res.setHeader('location', target.url); res.end(); });
  const log = logs();
  const notifier = make(redirecting.url, { log });

  await notifier.consider([spike()]);
  assert.equal(redirecting.hits.length, 1, 'not retried: a redirect will not fix itself');
  assert.equal(target.hits.length, 0, 'the redirect target was never reached');
  assert.equal(notifier.sent.size, 0);
  assert.match(log.lines.join(), /redirect \(HTTP 302\)/);
});

test('a failing endpoint costs nothing: no throw, no cooldown, and the next try can succeed', async (t) => {
  let healthy = false;
  const { url, hits } = await receiver(t, (req, res) => { res.statusCode = healthy ? 200 : 500; res.end(); });
  const notifier = make(url);

  await notifier.consider([spike()]);
  assert.equal(hits.length, 2, 'one try and one retry');
  assert.equal(notifier.lastSentAt, -Infinity);
  assert.equal(notifier.lastSentIso(), null);

  healthy = true;
  await notifier.consider([spike()]);
  assert.equal(hits.length, 3);
  assert.equal(notifier.sent.size, 1);
});

test('retries once, but only for errors that can pass', async (t) => {
  const flaky = await receiver(t, (req, res, hits) => { res.statusCode = hits.length === 1 ? 503 : 200; res.end(); });
  assert.equal(await make(flaky.url).send('x'), true);
  assert.equal(flaky.hits.length, 2);

  const limited = await receiver(t, (req, res, hits) => { res.statusCode = hits.length === 1 ? 429 : 200; res.end(); });
  assert.equal(await make(limited.url).send('x'), true);

  const wrong = await receiver(t, (req, res) => { res.statusCode = 404; res.end(); });
  assert.equal(await make(wrong.url).send('x'), false);
  assert.equal(wrong.hits.length, 1, 'a 404 is not retried');
});

test('a hanging endpoint times out instead of hanging the server', async (t) => {
  const { url, hits } = await receiver(t, () => {});
  const log = logs();
  const started = Date.now();
  assert.equal(await make(url, { timeoutMs: 80, log }).send('x'), false);
  assert.ok(Date.now() - started < 2000);
  assert.equal(hits.length, 2);
  assert.match(log.lines.join(), /a timeout/);
});

test('the default timeout is 5 seconds', () => {
  assert.equal(new Notifier({ url: 'https://example.com/h', log: logs() }).timeoutMs, 5000);
});

test('a dead endpoint is survived, and the secret URL is never logged', async (t) => {
  const { url } = await receiver(t);
  const dead = http.createServer();
  dead.listen(0, '127.0.0.1');
  await once(dead, 'listening');
  const closedUrl = `http://127.0.0.1:${dead.address().port}/hooks/${SECRET}`;
  dead.close();
  await once(dead, 'close');

  const log = logs();
  const notifier = make(closedUrl, { log });
  await notifier.consider([spike()]);
  assert.match(log.lines.join(), /a connection failure/);
  for (const line of log.lines) assert.ok(!line.includes(SECRET) && !line.includes('127.0.0.1'), line);
  assert.ok(url);
});

test('dedupe and cooldown survive a restart', async (t) => {
  const { url, hits } = await receiver(t);
  const file = join(tempDir(t), 'alerts.json');
  const first = make(url, { file });
  await first.consider([spike()]);
  assert.equal(hits.length, 1);

  const restarted = make(url, { file });
  await restarted.consider([spike()]);
  await restarted.consider([spike({ layer: 'l3' })]);
  assert.equal(hits.length, 1, 'same spike, and the cooldown is still running');
  assert.equal(restarted.lastSentIso(), first.lastSentIso());
  assert.ok(!readFileSync(file, 'utf8').includes(SECRET));
});

test('a corrupt state file is ignored rather than fatal', async (t) => {
  const { url, hits } = await receiver(t);
  const file = join(tempDir(t), 'alerts.json');
  writeFileSync(file, '{not json');
  const log = logs();
  await make(url, { file, log }).consider([spike()]);
  assert.equal(hits.length, 1);
  assert.match(log.lines.join(), /unreadable alert state/);
});

test('end to end: a surge in Radar data alerts once, however many refreshes follow', async (t) => {
  const step = 15 * 60 * 1000;
  const start = Date.now() - 100 * step;
  const serie = {
    serie_0: {
      timestamps: Array.from({ length: 100 }, (_, i) => new Date(start + i * step).toISOString()),
      values: Array.from({ length: 100 }, (_, i) => String(i >= 97 ? 5000 : 100 + (i % 4))),
    },
  };
  const { url, hits } = await receiver(t);
  const notifier = make(url);
  const intelligence = new Intelligence({
    config: testConfig(tempDir(t), { CLOUDFLARE_API_TOKEN: 'x' }), geo: noGeo, model: null, notifier, log: logs(),
    fetch: async (u) => json({ success: true, result: u.includes('/timeseries') ? serie : { top_0: [] } }),
  });

  for (let i = 0; i < 4; i++) await intelligence.refreshRadar();
  assert.equal(hits.length, 1);
  assert.equal(intelligence.status().alerts.enabled, true);
  assert.match(intelligence.status().alerts.lastSentAt, /^\d{4}-/);
  assert.ok(!JSON.stringify(intelligence.snapshot()).includes(SECRET), 'the URL never reaches the dashboard');

  const quiet = new Intelligence({ config: testConfig(tempDir(t)), geo: noGeo, model: null, log: logs() });
  assert.deepEqual(quiet.status().alerts, { enabled: false, lastSentAt: null });
});

test('alerts never block the dashboard: the broadcast happens before the webhook is called', async (t) => {
  const order = [];
  const notifier = { consider: async () => { order.push('webhook'); }, lastSentIso: () => null };
  const intelligence = new Intelligence({
    config: testConfig(tempDir(t), { CLOUDFLARE_API_TOKEN: 'x' }), geo: noGeo, model: null, notifier, log: logs(),
    onChange: () => order.push('broadcast'),
    fetch: async () => json({ success: true, result: { top_0: [] } }),
  });
  await intelligence.refreshRadar();
  assert.deepEqual(order, ['broadcast', 'webhook']);
});

test('ALERT_WEBHOOK_URL is validated at startup and an error never repeats it', () => {
  const ok = 'https://hooks.slack.com/services/T000/B000/XXXX';
  assert.equal(loadConfig({ ALERT_WEBHOOK_URL: ok }).alertWebhookUrl, ok);
  assert.equal(loadConfig({}).alertWebhookUrl, '');
  assert.equal(loadConfig({ ALERT_WEBHOOK_URL: '  ' }).alertWebhookUrl, '');

  const bad = {
    'not a url': /not a valid URL/,
    [`http://hooks.example.com/${SECRET}`]: /must use https/,
    [`ftp://hooks.example.com/${SECRET}`]: /must use https/,
    [`https://user:${SECRET}@hooks.example.com/x`]: /username or password/,
    [`https://localhost/${SECRET}`]: /public host/,
    [`https://app.localhost/${SECRET}`]: /public host/,
    [`https://127.0.0.1/${SECRET}`]: /public host/,
    [`https://10.0.0.5/${SECRET}`]: /public host/,
    [`https://169.254.169.254/${SECRET}`]: /public host/,
    [`https://[::1]/${SECRET}`]: /public host/,
    [`https://[fd00::1]/${SECRET}`]: /public host/,
  };
  for (const [url, expected] of Object.entries(bad)) {
    assert.throws(() => loadConfig({ ALERT_WEBHOOK_URL: url }), (error) => expected.test(error.message) && !error.message.includes(SECRET), url);
  }
  assert.ok(loadConfig({ ALERT_WEBHOOK_URL: 'https://8.8.8.8/hook' }).alertWebhookUrl);
});
