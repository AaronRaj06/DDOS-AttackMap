import assert from 'node:assert/strict';
import { test } from 'node:test';
import { train } from '../ml/classifier.js';
import { Intelligence } from '../services/intelligence.js';
import { dataset } from './fixtures.js';
import { noGeo, silent, tempDir, testConfig } from './helpers.js';

const DAY = 24 * 3600_000;
const NOW = Date.parse('2026-11-23T00:00:00Z');
const asnGeo = { ...noGeo, hasASN: true };
const trained = (daysAgo) => ({ ...train(dataset()), trainedAt: new Date(NOW - daysAgo * DAY).toISOString() });

function card(t, model, geo = asnGeo) {
  return new Intelligence({ config: testConfig(tempDir(t)), geo, model, now: () => NOW, log: silent }).classifierStatus();
}

test('no model means untrained, with nothing to show', (t) => {
  assert.deepEqual(card(t, null), { state: 'untrained', metrics: null });
});

test('a fresh model reports when it was trained, on how much, and how it scored', (t) => {
  const status = card(t, trained(2));
  assert.equal(status.state, 'active');
  assert.equal(status.ageDays, 2);
  assert.equal(status.trainedAt, new Date(NOW - 2 * DAY).toISOString());
  assert.deepEqual(Object.keys(status.samples), ['train', 'validation', 'test']);
  assert.equal(status.samples.test + status.samples.train + status.samples.validation, 2000);
  for (const key of ['precision', 'recall', 'f1', 'averagePrecision', 'baseline']) {
    assert.ok(status.metrics[key] >= 0 && status.metrics[key] <= 1, key);
  }
  assert.ok(status.threshold > 0 && status.threshold < 1);
});

test('a model goes stale after 30 days, and not a day sooner', (t) => {
  assert.equal(card(t, trained(29.9)).state, 'active');
  assert.equal(card(t, trained(30)).state, 'active');
  assert.equal(card(t, trained(30.1)).state, 'stale');
  assert.equal(card(t, trained(30.1)).ageDays, 30);
  assert.equal(card(t, trained(200)).ageDays, 200);
});

test('a model dated in the future or with a broken date is handled', (t) => {
  assert.equal(card(t, trained(-3)).ageDays, 0);
  const broken = card(t, { ...trained(1), trainedAt: 'last tuesday' });
  assert.deepEqual([broken.state, broken.ageDays], ['stale', null]);
});

test('without the ASN database the model cannot run, whatever its age', (t) => {
  assert.equal(card(t, trained(1), noGeo).state, 'needs_geo_database');
  assert.equal(card(t, trained(90), noGeo).state, 'needs_geo_database');
});

test('a stale model still scores, and says so in /health', (t) => {
  const intelligence = new Intelligence({ config: testConfig(tempDir(t)), geo: { ...asnGeo, locate: (ip, c) => ({ ...noGeo.locate(ip, c), asn: 101, org: 'Example Hosting' }) }, model: trained(60), now: () => NOW, log: silent });
  intelligence.showBlacklist({ entries: [{ ip: '30.1.1.1', country: 'US' }] });
  assert.equal(intelligence.status().classifier.state, 'stale');
  assert.equal(intelligence.threats.flagged, 1);
});
