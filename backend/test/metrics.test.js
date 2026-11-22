import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createService } from '../app.js';
import { loadConfig } from '../config/index.js';
import { bearerMatches, renderMetrics } from '../services/metrics.js';
import { json, silent, tempDir, testConfig } from './helpers.js';

const TOKEN = 'a-long-enough-secret-token';
const sample = (over = {}) => ({
  radar: { state: 'ok', updatedAt: '2026-11-23T10:00:00.000Z' },
  abuse: { state: 'stale', updatedAt: null },
  clients: 3, events: 41, spikes: [{ layer: 'l7' }], uptime: 99.5,
  memory: { rss: 1000, heapUsed: 500 }, ...over,
});

// A small strict parser for the Prometheus text format, so the test checks the format and not strings
function parse(text) {
  assert.ok(text.endsWith('\n'), 'ends with a newline');
  const families = new Map();
  for (const line of text.trimEnd().split('\n')) {
    let match;
    if ((match = /^# HELP ([a-zA-Z_:][a-zA-Z0-9_:]*) (.+)$/.exec(line))) {
      families.set(match[1], { help: match[2], samples: [] });
    } else if ((match = /^# TYPE ([a-zA-Z_:][a-zA-Z0-9_:]*) (gauge|counter)$/.exec(line))) {
      families.get(match[1]).type = match[2];
    } else if ((match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(?:[a-zA-Z_][a-zA-Z0-9_]*="(?:[^"\\]|\\.)*",?)+\})? (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/.exec(line))) {
      families.get(match[1]).samples.push({ labels: match[2] ?? '', value: Number(match[3]) });
    } else {
      assert.fail(`not valid Prometheus text: ${JSON.stringify(line)}`);
    }
  }
  return families;
}

test('renders every gauge in valid Prometheus text format', () => {
  const families = parse(renderMetrics(sample()));
  assert.deepEqual([...families.keys()], [
    'dosmap_radar_last_success_timestamp_seconds', 'dosmap_abuseipdb_last_success_timestamp_seconds', 'dosmap_source_state',
    'dosmap_websocket_clients', 'dosmap_events_replayed_total', 'dosmap_active_spikes', 'dosmap_uptime_seconds',
    'dosmap_process_resident_memory_bytes', 'dosmap_process_heap_used_bytes',
  ]);
  for (const [name, family] of families) assert.ok(family.type && family.help && family.samples.length, name);
  const value = (name, labels = '') => families.get(name).samples.find((s) => s.labels === labels).value;
  assert.equal(value('dosmap_radar_last_success_timestamp_seconds'), Date.parse('2026-11-23T10:00:00Z') / 1000);
  assert.equal(value('dosmap_abuseipdb_last_success_timestamp_seconds'), 0);
  assert.equal(value('dosmap_websocket_clients'), 3);
  assert.equal(families.get('dosmap_events_replayed_total').type, 'counter');
  assert.equal(value('dosmap_active_spikes', '{layer="l7"}'), 1);
  assert.equal(value('dosmap_active_spikes', '{layer="l3"}'), 0);
  assert.equal(value('dosmap_uptime_seconds'), 99.5);
  assert.equal(value('dosmap_process_resident_memory_bytes'), 1000);
});

test('each source has exactly one current state', () => {
  const { samples } = parse(renderMetrics(sample())).get('dosmap_source_state');
  for (const source of ['radar', 'abuseipdb']) {
    const mine = samples.filter((s) => s.labels.includes(`source="${source}"`));
    assert.equal(mine.reduce((sum, s) => sum + s.value, 0), 1, source);
  }
  assert.equal(samples.find((s) => s.labels === '{source="radar",state="ok"}').value, 1);
  assert.equal(samples.find((s) => s.labels === '{source="abuseipdb",state="stale"}').value, 1);
});

test('odd values cannot break the format', () => {
  const nasty = renderMetrics(sample({ radar: { state: 'we"ird\nstate\\', updatedAt: 'garbage' }, uptime: NaN, events: Infinity }));
  const families = parse(nasty);
  assert.equal(families.get('dosmap_uptime_seconds').samples[0].value, 0);
  assert.equal(families.get('dosmap_events_replayed_total').samples[0].value, 0);
  assert.equal(families.get('dosmap_radar_last_success_timestamp_seconds').samples[0].value, 0);
});

test('bearer comparison: exact token only, and any length is safe', () => {
  assert.equal(bearerMatches(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(bearerMatches(`bearer ${TOKEN}`, TOKEN), true);
  for (const header of [undefined, '', 'Bearer', 'Bearer ', `Bearer ${TOKEN} `, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`,
    `Basic ${TOKEN}`, TOKEN, `Bearer  ${TOKEN}`, `Bearer ${TOKEN.toUpperCase()}`, `Bearer ${'x'.repeat(10_000)}`, 'Bearer \u0000']) {
    assert.equal(bearerMatches(header, TOKEN), false, JSON.stringify(header)?.slice(0, 40));
  }
});

test('METRICS_TOKEN must be long enough, and the error never repeats it', () => {
  assert.equal(loadConfig({}).metricsToken, '');
  assert.equal(loadConfig({ METRICS_TOKEN: TOKEN }).metricsToken, TOKEN);
  assert.throws(() => loadConfig({ METRICS_TOKEN: 'short-secret' }), (e) => /at least 16/.test(e.message) && !e.message.includes('short-secret'));
});

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
  return { host, get: (path, headers = {}) => fetch(`http://${host}${path}`, { headers }) };
}
const auth = { authorization: `Bearer ${TOKEN}` };

test('without METRICS_TOKEN the endpoint does not exist', async (t) => {
  const { get } = await boot(t);
  assert.equal((await get('/metrics')).status, 404);
  assert.equal((await get('/metrics', auth)).status, 404);
});

test('with a token, /metrics demands it', async (t) => {
  const { get } = await boot(t, { METRICS_TOKEN: TOKEN });
  const none = await get('/metrics');
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');
  for (const authorization of ['Bearer wrong-token-wrong-token', `Bearer ${TOKEN}x`, `Basic ${TOKEN}`]) {
    assert.equal((await get('/metrics', { authorization })).status, 401);
  }
  const ok = await get('/metrics', auth);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'text/plain; version=0.0.4; charset=utf-8');
  assert.ok(!(await ok.text()).includes(TOKEN));
  assert.equal((await get('/health')).status, 200, '/health stays open for liveness probes');
});

test('live numbers: clients, replayed events, source state and active spikes', async (t) => {
  const step = 15 * 60 * 1000;
  const start = Date.now() - 100 * step;
  const serie = {
    serie_0: {
      timestamps: Array.from({ length: 100 }, (_, i) => new Date(start + i * step).toISOString()),
      values: Array.from({ length: 100 }, (_, i) => String(i >= 97 ? 5000 : 100 + (i % 4))),
    },
  };
  const { host, get } = await boot(t, { METRICS_TOKEN: TOKEN, CLOUDFLARE_API_TOKEN: 'x' }, {
    fetch: async (url) => json({ success: true, result: url.includes('/timeseries') ? serie : { top_0: [] } }),
  });
  const socket = new WebSocket(`ws://${host}/ws`);
  await once(socket, 'open');
  await sleep(1500);

  const families = parse(await (await get('/metrics', auth)).text());
  const value = (name, labels = '') => families.get(name).samples.find((s) => s.labels === labels).value;
  assert.equal(value('dosmap_websocket_clients'), 1);
  assert.equal(value('dosmap_active_spikes', '{layer="l7"}'), 1);
  assert.equal(value('dosmap_source_state', '{source="radar",state="partial"}'), 1);
  assert.ok(value('dosmap_radar_last_success_timestamp_seconds') > Date.now() / 1000 - 60);
  assert.ok(value('dosmap_uptime_seconds') > 0 && value('dosmap_process_resident_memory_bytes') > 1e6);
  socket.close();
});

test('the replayed-events counter only goes up', async (t) => {
  const { get } = await boot(t, { METRICS_TOKEN: TOKEN });
  await sleep(200);
  const read = async () => parse(await (await get('/metrics', auth)).text()).get('dosmap_events_replayed_total').samples[0].value;
  const first = await read();
  await sleep(1600);
  assert.ok(first >= 1 && (await read()) > first);
});

test('guessing the token is rate limited like everything else', async (t) => {
  const { get } = await boot(t, { METRICS_TOKEN: TOKEN });
  const statuses = [];
  for (let i = 0; i < 61; i++) statuses.push((await get('/metrics', { authorization: 'Bearer nope-nope-nope-nope' })).status);
  assert.deepEqual([statuses[59], statuses[60]], [401, 429]);
  assert.equal((await get('/metrics', auth)).status, 429, 'even the right token waits its turn');
});
