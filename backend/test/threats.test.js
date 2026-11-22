import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { collect, readDataset } from '../ml/dataset.js';
import { AbuseIPDBClient } from '../services/abuseIPDB.js';
import { REFRESH_MS, refreshBlacklist, toPublicThreats } from '../services/threatFeed.js';
import { json, noGeo, silent, tempDir } from './helpers.js';

const blacklist = () => json({
  meta: { generatedAt: '2026-11-20T00:00:00+00:00' },
  data: [{ ipAddress: '203.0.113.77', countryCode: 'US', lastReportedAt: '2026-11-19T23:00:00+00:00' }, { ipAddress: 'junk' }],
});

function setup(t, respond) {
  const state = { calls: 0, now: 1_000_000 };
  const client = new AbuseIPDBClient('key', { fetch: async () => { state.calls++; return respond(state); } });
  const file = join(tempDir(t), 'cache.json');
  state.refresh = () => refreshBlacklist({ client, file, now: () => state.now });
  return state;
}

test('at most 4 blacklist calls a day, even when restarted every 10 minutes', async (t) => {
  const state = setup(t, blacklist);
  for (let i = 0; i < 144; i++) {
    await state.refresh(); // reads the schedule from disk each time, like a restart
    state.now += 10 * 60 * 1000;
  }
  assert.equal(state.calls, 4);
});

test('a 429 waits as long as the API asks', async (t) => {
  const state = setup(t, () => json({}, 429, { 'retry-after': '40000' }));
  assert.equal((await state.refresh()).delay, 40_000_000);
});

test('server errors wait a full interval, because they may have used quota', async (t) => {
  const state = setup(t, () => json({}, 500));
  assert.equal((await state.refresh()).delay, REFRESH_MS);
});

test('a rejected key and a network failure retry soon', async (t) => {
  assert.equal((await setup(t, () => json({}, 401)).refresh()).delay, 60_000);
  assert.equal((await setup(t, () => { throw new Error('offline'); }).refresh()).delay, 900_000);
});

test('a failed refresh keeps the previous list', async (t) => {
  const state = setup(t, ({ calls }) => (calls === 1 ? blacklist() : json({}, 500)));
  await state.refresh();
  state.now += REFRESH_MS;
  const { cache } = await state.refresh();
  assert.equal(cache.entries.length, 1);
  assert.match(cache.error, /HTTP 500/);
});

test('public output masks addresses', async (t) => {
  const { cache } = await setup(t, blacklist).refresh();
  const output = toPublicThreats(cache, noGeo, null);
  assert.equal(output.total, 1);
  assert.equal(output.points[0].network, '203.0.113.0/24');
  assert.equal(output.points[0].dosScore, null);
  assert.ok(!JSON.stringify(output).includes('203.0.113.77'));
});

test('public output is capped but counts everything', () => {
  const entries = Array.from({ length: 1500 }, (_, i) => ({ ip: `10.0.${i >> 8}.${i & 255}`, country: 'US' }));
  const output = toPublicThreats({ entries }, noGeo, null);
  assert.equal(output.total, 1500);
  assert.equal(output.points.length, 1000);
});

test('collection labels category 4, skips known IPs and stops when quota runs out', async (t) => {
  const file = join(tempDir(t), 'labels.jsonl');
  let calls = 0;
  const client = new AbuseIPDBClient('key', {
    fetch: async () => {
      calls++;
      return json({ data: { reports: [{ categories: calls === 1 ? [18, 4] : [22] }] } }, 200,
        { 'x-ratelimit-remaining': calls === 2 ? '0' : '5' });
    },
  });
  const entries = ['198.51.100.1', '198.51.100.2', '198.51.100.3'].map((ip) => ({ ip, country: 'US' }));
  const run = (list) => collect({ client, geo: noGeo, blacklist: { entries: list }, file, log: silent });

  assert.equal((await run(entries)).added, 2);
  const saved = await readDataset(file);
  assert.deepEqual(saved.map((row) => row.ddos), [true, false]);

  await run(entries.filter((entry) => saved.some((row) => row.ip === entry.ip)));
  assert.equal(calls, 2);
});
