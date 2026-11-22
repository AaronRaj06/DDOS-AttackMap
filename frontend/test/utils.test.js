import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { feedReducer, initialFeed, RECENT_LIMIT } from '../src/utils/feed.js';
import { arcPoints, landSegments, toXYZ } from '../src/utils/geo.js';

const near = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6, `${actual} != ${expected}`));

test('coordinates land on the right axes', () => {
  near(toXYZ(90, 0), [0, 1, 0]);
  near(toXYZ(0, 0), [1, 0, 0]);
  near(toXYZ(0, 90), [0, 0, -1]); // east is to the right when facing longitude 0
});

test('arcs join their endpoints and stay above the surface, antipodes included', () => {
  for (const [from, to] of [[[51, 0], [40, -74]], [[0, 0], [0, 180]], [[90, 0], [-90, 0]], [[35, 139], [37, -122]]]) {
    const points = arcPoints(from, to);
    near(points[0], toXYZ(...from, 1.006));
    near(points.at(-1), toXYZ(...to, 1.006));
    for (const point of points) assert.ok(Math.hypot(...point) >= 1.005);
  }
});

test('domestic attacks have no arc', () => {
  assert.equal(arcPoints([10, 20], [10, 20]), null);
});

test('the bundled map becomes finite segments', () => {
  const url = new URL('../public/geojson/ne_110m_land.json', import.meta.url);
  const segments = landSegments(JSON.parse(readFileSync(url, 'utf8')));
  assert.ok(segments.length > 10000);
  assert.equal(segments.length % 6, 0);
  assert.ok(segments.every(Number.isFinite));
});

test('the event count keeps rising past the visible limit', () => {
  let feed = initialFeed;
  for (let id = 0; id < 250; id++) feed = feedReducer(feed, { type: 'event', data: { id } });
  assert.equal(feed.received, 250);
  assert.equal(feed.events.length, RECENT_LIMIT);
});

test('a reconnect snapshot keeps the count', () => {
  const feed = feedReducer({ ...initialFeed, received: 9 }, { type: 'snapshot', data: { events: [] } });
  assert.equal(feed.received, 9);
});
