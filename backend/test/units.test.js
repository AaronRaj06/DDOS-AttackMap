import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { test } from 'node:test';
import { loadConfig } from '../config/index.js';
import { demoTrends } from '../services/demoTrends.js';
import { generateEvent, pickWeighted } from '../services/eventGenerator.js';
import { EventStore } from '../services/eventStore.js';
import { openGeoIP } from '../services/geoIP.js';
import { clientIP, networkOf } from '../services/ip.js';
import { silent, tempDir } from './helpers.js';

test('.env.example holds no secrets', () => {
  const text = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  for (const name of ['CLOUDFLARE_API_TOKEN', 'ABUSEIPDB_KEY', 'MONGODB_URI']) {
    assert.match(text, new RegExp(`^${name}=$`, 'm'));
  }
});

test('networks are masked', () => {
  const cases = {
    '8.8.4.4': '8.8.4.0/24',
    '2001:db8::1': '2001:db8:0::/48',
    '2001:0DB8:00AA:1:2:3:4:5': '2001:db8:aa::/48',
    '::1': '0:0:0::/48',
    '::ffff:1.2.3.4': '0:0:0::/48',
  };
  for (const [ip, network] of Object.entries(cases)) {
    assert.equal(networkOf(ip), network);
    assert.ok(isIP(network.split('/')[0]), network);
  }
  assert.throws(() => networkOf('nope'));
});

test('forwarded headers are ignored unless a proxy is trusted', () => {
  const request = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '6.6.6.6, 9.9.9.9' } };
  assert.equal(clientIP(request, 0), '10.0.0.1');
  assert.equal(clientIP(request, 1), '9.9.9.9');
  assert.equal(clientIP(request, 2), '6.6.6.6');
});

test('config rejects nonsense', () => {
  assert.equal(loadConfig({}).port, 5050);
  assert.equal(loadConfig({}).host, '127.0.0.1');
  for (const PORT of ['abc', '-1', '70000', '1.5']) assert.throws(() => loadConfig({ PORT }));
  assert.throws(() => loadConfig({ TRUST_PROXY: 'true' }));
});

test('sampling follows the shares', () => {
  const items = [{ share: 1 }, { share: 3 }];
  assert.equal(pickWeighted(items, () => 0.24), items[0]);
  assert.equal(pickWeighted(items, () => 0.26), items[1]);
});

test('events carry no invented IPs or packet rates', () => {
  const event = generateEvent(demoTrends(), 'demo');
  assert.equal(event.source, 'demo');
  for (const key of ['src_ip', 'dst_ip', 'pps']) assert.ok(!(key in event));
  assert.equal(generateEvent([], 'radar'), null);
});

test('every demo route has coordinates', () => {
  for (const { src, dst } of demoTrends()) assert.ok(Number.isFinite(src.lat) && Number.isFinite(dst.lon));
});

test('the store is bounded and restores without duplicates', () => {
  const store = new EventStore(3);
  for (const id of [3, 4]) store.addEvent({ id });
  store.restore([{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(store.events.map((event) => event.id), [2, 3, 4]);
});

test('location falls back to the country without a database', async (t) => {
  const geo = await openGeoIP(tempDir(t), { log: silent });
  assert.equal(geo.locate('1.1.1.1', 'AU').precise, false);
  assert.ok(geo.locate('1.1.1.1', 'AU').lat < 0);
  assert.equal(geo.locate('1.1.1.1', null).lat, null);
});
