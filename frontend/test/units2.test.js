import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { formatAge } from '../src/utils/age.js';
import {
  DEFAULT_FILTERS, MAX_WATCHED, hasActiveFilters, matchesEvent, matchesPoint, matchesRoute, matchesTarget, parseUrlState, toSearch,
} from '../src/utils/filters.js';
import { arc2d, landPath, projectXY } from '../src/utils/geo.js';
import { formatChange, formatDuration, humanizeBucket, spikeSentence } from '../src/utils/labels.js';
import { buildSparkline } from '../src/utils/sparkline.js';
import { readStored, writeStored } from '../src/utils/storage.js';

test('ages read naturally and never lie about the future', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  const ago = (seconds) => new Date(now - seconds * 1000).toISOString();
  assert.deepEqual([0, 44, 45 - 1].map((s) => formatAge(ago(s), now)), ['just now', 'just now', 'just now']);
  assert.equal(formatAge(ago(45), now), '1 min ago');
  assert.equal(formatAge(ago(89), now), '1 min ago');
  assert.equal(formatAge(ago(240), now), '4 min ago');
  assert.equal(formatAge(ago(3599), now), '59 min ago');
  assert.equal(formatAge(ago(3600), now), '1 h ago');
  assert.equal(formatAge(ago(23.9 * 3600), now), '23 h ago');
  assert.equal(formatAge(ago(24 * 3600), now), '1 d ago');
  assert.equal(formatAge(ago(-30), now), 'just now');
  assert.equal(formatAge(ago(-86400), now), 'just now');
  for (const bad of [null, undefined, '', 'yesterday', {}]) assert.equal(formatAge(bad, now), 'unknown');
});

test('URL state accepts only known values', () => {
  assert.deepEqual(parseUrlState('?layer=l7&country=de,FR&flagged=1&kiosk=1'),
    { filters: { layer: 'l7', flagged: true, countries: ['DE', 'FR'] }, hasCountries: true, kiosk: true });
  assert.deepEqual(parseUrlState('').filters, DEFAULT_FILTERS);
  const hostile = parseUrlState('?layer=<script>&country=ZZ,XX,<img src=x>,DEU,1,,%00,de,DE&flagged=true&kiosk=yes&evil=1');
  assert.deepEqual(hostile, { filters: { layer: 'all', flagged: false, countries: ['DE'] }, hasCountries: true, kiosk: false });
  assert.equal(parseUrlState('?layer=L7').filters.layer, 'all', 'case matters for layers');
  assert.equal(parseUrlState('?layer=l3&layer=l7').filters.layer, 'l3', 'only the first of a repeated key counts');
  const many = parseUrlState(`?country=${['US', 'CN', 'RU', 'BR', 'IN', 'DE', 'GB', 'FR', 'KR', 'JP', 'SG', 'HK', 'TW', 'NL', 'NO', 'ID', 'VN', 'UA', 'MT', 'BH', 'MU', 'SC'].join(',')}`);
  assert.equal(many.filters.countries.length, MAX_WATCHED);
});

test('URL state round-trips and omits defaults', () => {
  assert.equal(toSearch(DEFAULT_FILTERS), '');
  assert.equal(toSearch({ layer: 'l7', flagged: true, countries: ['DE', 'FR'] }, true), '?layer=l7&country=DE,FR&flagged=1&kiosk=1');
  for (const search of ['?layer=l3', '?country=US,CN&flagged=1', '?kiosk=1', '?layer=l7&country=DE']) {
    const { filters, kiosk } = parseUrlState(search);
    assert.equal(toSearch(filters, kiosk), search);
  }
});

test('filters match layers, watched countries and flagged-only', () => {
  const f = { layer: 'l7', flagged: false, countries: ['DE'] };
  assert.equal(matchesEvent(f, { layer: 'l7', src_country: 'DE', dst_country: 'US' }), true);
  assert.equal(matchesEvent(f, { layer: 'l7', src_country: 'US', dst_country: 'DE' }), true, 'either end counts');
  assert.equal(matchesEvent(f, { layer: 'l7', src_country: 'US', dst_country: 'FR' }), false);
  assert.equal(matchesEvent(f, { layer: 'l3', src_country: 'DE', dst_country: 'US' }), false);
  assert.equal(matchesRoute(f, { layer: 'l7', src: { code: 'DE' }, dst: { code: 'US' } }), true);
  assert.equal(matchesTarget(f, { layer: 'l7', country: { code: 'FR' } }), false);
  assert.equal(matchesEvent(DEFAULT_FILTERS, { layer: 'l3', src_country: 'X', dst_country: 'Y' }), true);

  assert.equal(matchesPoint({ ...DEFAULT_FILTERS, flagged: true }, { flagged: false, country: 'US' }), false);
  assert.equal(matchesPoint({ ...DEFAULT_FILTERS, flagged: true }, { flagged: true, country: 'US' }), true);
  assert.equal(matchesPoint({ ...DEFAULT_FILTERS, layer: 'l3' }, { flagged: false, country: 'US' }), true, 'points have no layer');
  assert.equal(matchesPoint(f, { flagged: true, country: 'FR' }), false);
  assert.deepEqual([hasActiveFilters(DEFAULT_FILTERS), hasActiveFilters({ ...DEFAULT_FILTERS, flagged: true })], [false, true]);
});

test('storage survives a browser that refuses it', () => {
  const real = globalThis.window;
  try {
    globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } } };
    assert.equal(readStored('k', 'fallback'), 'fallback');
    assert.equal(writeStored('k', 1), false);
    globalThis.window = undefined;
    assert.equal(readStored('k', 7), 7);
    const data = {};
    globalThis.window = { localStorage: { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } } };
    assert.equal(writeStored('k', { a: [1] }), true);
    assert.deepEqual(readStored('k', null), { a: [1] });
    data.bad = '{not json';
    assert.equal(readStored('bad', 'fallback'), 'fallback');
  } finally {
    globalThis.window = real;
  }
});

test('Radar bucket names become readable', () => {
  assert.equal(humanizeBucket('UNDER_10_MINS'), 'Under 10 min');
  assert.equal(humanizeBucket('_10_20_MINS'), '10–20 min');
  assert.equal(humanizeBucket('_500_MBPS_TO_1_GBPS'), '500 Mbps to 1 Gbps');
  assert.equal(humanizeBucket('OVER_100_GBPS'), 'Over 100 Gbps');
  assert.equal(humanizeBucket('weird'), 'Weird');
  assert.equal(formatChange(10), '+10.0 pts');
  assert.equal(formatChange(-2.25), '−2.3 pts');
  assert.equal(formatChange(0), '0.0 pts');
  assert.deepEqual([formatDuration(30_000), formatDuration(45 * 60_000), formatDuration(135 * 60_000), formatDuration(120 * 60_000)], ['1 min', '45 min', '2 h 15 min', '2 h']);
  const spike = { layer: 'l7', ratio: 3.4, active: true, start: '2026-11-23T10:15:00.000Z', end: null };
  assert.match(spikeSentence(spike), /Application layer \(L7\) reached 3\.4x its recent level, since 11-23 10:15 UTC/);
  assert.match(spikeSentence({ ...spike, active: false, end: '2026-11-23T11:00:00.000Z', ratio: null }), /far above.*10:15 UTC to 11-23 11:00 UTC/);
});

test('sparklines scale, stay in bounds and survive flat or tiny series', () => {
  const pts = (values) => values.map((v, i) => ({ t: new Date(Date.UTC(2026, 10, 23, 0, i * 15)).toISOString(), v }));
  const s = buildSparkline(pts([1, 5, 3, 9, 2]), { width: 100, height: 40, pad: 2 });
  assert.equal(s.min, 1);
  assert.equal(s.max, 9);
  assert.equal(s.y(9), 2);
  assert.equal(s.y(1), 38);
  assert.equal(s.x(s.t0), 2);
  assert.equal(s.x(s.t1), 98);
  assert.match(s.line, /^M[\d. ]+(L[\d. ]+)+$/);
  assert.ok(s.area.endsWith('Z'));
  assert.equal(buildSparkline(pts([4, 4, 4])).y(4), 22);
  assert.equal(buildSparkline(pts([1])), null);
  assert.equal(buildSparkline([]), null);
  assert.equal(buildSparkline([{ t: 'x', v: 1 }, { t: 'y', v: 2 }]), null);
});

test('map projection and arcs', () => {
  assert.deepEqual(projectXY(0, 0), [180, 90]);
  assert.deepEqual(projectXY(90, -180), [0, 0]);
  assert.match(arc2d([48, 2], [40, -74]), /^M182\.0 42\.0Q[\d. ]+ [\d. -]+ 106\.0 50\.0$/);
  // across the date line the short way: x runs past the edge instead of spanning the map
  assert.match(arc2d([35, 170], [35, -170]), /^M350\.0 55\.0Q[\d. -]+ 370\.0 55\.0$/);
  assert.ok(!arc2d([0, 0], [0, 0]).includes('NaN'));
});

test('the bundled land becomes one clean path', () => {
  const data = JSON.parse(readFileSync(new URL('../public/geojson/ne_110m_land.json', import.meta.url), 'utf8'));
  const path = landPath(data);
  assert.ok(path.length > 20_000 && path.startsWith('M'));
  assert.ok(!/NaN|undefined/.test(path));
  const nums = [...path.matchAll(/-?\d+\.\d/g)].map(Number);
  assert.ok(nums.every((n) => n >= -0.1 && n <= 360.1), 'every coordinate is inside the 360 x 180 map');
});
