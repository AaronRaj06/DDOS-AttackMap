import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulletin } from '../src/utils/bulletin.js';

const live = { mode: 'live' };
const germany = { code: 'DE', name: 'Germany', lat: 51, lon: 10 };
const route = (layer, share) => ({ layer, share, src: germany, dst: germany });
const calm = (status) => ({ status, active: [] });

test('nothing to say before the first snapshot', () => {
  assert.equal(bulletin(null, calm('unavailable'), []), null);
});

test('demo and missing Radar data never report a status', () => {
  assert.match(bulletin({ mode: 'demo' }, calm('normal'), [route('l3', 9)]), /^Demo data: .*no spike status/);
  assert.match(bulletin({ mode: 'unavailable' }, calm('unavailable'), []), /unavailable right now/);
});

test('a running spike names its layer, start and size, then the top origin', () => {
  const spikes = { status: 'spike', active: [{ layer: 'l7', start: '2026-11-27T09:15:00.000Z', ratio: 2.4 }] };
  assert.equal(
    bulletin(live, spikes, [route('l3', 12.5)]),
    'Application layer (L7): spike since 11-27 09:15 UTC, about 2.4x its typical level. Top origin: Germany, 12.5% of network-layer attacks.',
  );
  const unsized = { status: 'spike', active: [{ layer: 'l3', start: '2026-11-27T09:15:00.000Z', ratio: null }] };
  assert.match(bulletin(live, unsized, []), /far above its typical level\.$/);
});

test('calm states say only what the combined status supports', () => {
  assert.equal(bulletin(live, calm('normal'), []), 'Traffic is within its usual range for the last day.');
  assert.doesNotMatch(bulletin(live, calm('normal'), []), /both/i);
  assert.match(bulletin(live, calm('elevated'), []), /above its usual range, but no spike is confirmed/);
  assert.match(bulletin(live, calm('unavailable'), []), /needs more Radar history/);
});
