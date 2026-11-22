import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { averagePrecision, evaluate, explain, loadModel, neutralAgeHours, score, splitOf, train } from '../ml/classifier.js';
import { toPublicThreats } from '../services/threatFeed.js';
import { dataset } from './fixtures.js';
import { noGeo, silent, tempDir } from './helpers.js';

test('learns a planted signal on held-out networks', () => {
  const model = train(dataset());
  assert.ok(model.useful);
  assert.ok(model.metrics.averagePrecision > model.metrics.baseline * 1.7);
  assert.ok(model.metrics.precision > 0.7 && model.metrics.recall > 0.6);
});

test('refuses to call noise a useful model', () => {
  assert.equal(train(dataset({ signal: false })).useful, false);
});

test('refuses small and single-class datasets', () => {
  assert.throws(() => train(dataset({ size: 100 })), /at least 500/);
  assert.throws(() => train(dataset().map((row) => ({ ...row, ddos: false }))), /each class/);
});

test('neighbors share a split', () => {
  for (let i = 0; i < 200; i++) assert.equal(splitOf(`45.3.${i}.1`), splitOf(`45.3.${i}.250`));
  assert.equal(splitOf('2001:db8:1::1'), splitOf('2001:db8:1:ffff::9'));
});

test('metrics match hand-worked examples', () => {
  assert.equal(averagePrecision([1, 1, 1, 1], [1, 0, 0, 0]), 0.25);
  assert.equal(averagePrecision([0.9, 0.8, 0.1], [1, 0, 1]), 0.5 + 1 / 3);
  const result = evaluate([0.9, 0.8, 0.2, 0.1], [1, 0, 1, 0], 0.5);
  assert.deepEqual([result.precision, result.recall, result.f1], [0.5, 0.5, 0.5]);
});

test('features cannot see the label', () => {
  const model = train(dataset());
  const [row] = dataset();
  assert.equal(score(model, { ...row, ddos: true }), score(model, { ...row, ddos: false }));
});

test('loads valid models and ignores broken ones', (t) => {
  const file = join(tempDir(t), 'model.json');
  assert.equal(loadModel(file, { log: silent }), null);
  for (const bad of ['{oops', '{}', JSON.stringify({ vocabulary: { countries: [], asns: [] }, weights: [1] })]) {
    writeFileSync(file, bad);
    assert.equal(loadModel(file, { log: silent }), null);
  }
  writeFileSync(file, JSON.stringify(train(dataset())));
  assert.ok(loadModel(file, { log: silent }));
});

test('flags likely sources only when ASN data is available', () => {
  const model = train(dataset());
  const entries = [{ ip: '198.51.100.1', country: 'US' }];
  const hosting = { ...noGeo, hasASN: true, locate: (ip, c) => ({ ...noGeo.locate(ip, c), asn: 101, org: 'Example Hosting' }) };
  assert.equal(toPublicThreats({ entries }, hosting, model).flagged, 1);
  assert.equal(toPublicThreats({ entries }, noGeo, model).flagged, 0);
});

test('flagged IPs do not crowd every other dot off the map', () => {
  const model = train(dataset());
  const geo = {
    ...noGeo,
    hasASN: true,
    locate: (ip, c) => ({ ...noGeo.locate(ip, c), asn: 101, org: ip.startsWith('10.') ? 'Example Hosting' : 'Example Net' }),
  };
  const group = (first, n) => Array.from({ length: n }, (_, i) => ({ ip: `${first}.0.${i >> 8}.${i & 255}`, country: 'US' }));

  const mixed = toPublicThreats({ entries: [...group(10, 1500), ...group(20, 1500)] }, geo, model);
  assert.equal(mixed.flagged, 1500);
  assert.equal(mixed.points.filter((point) => point.flagged).length, 500);
  assert.equal(mixed.points.length, 1000);

  const allFlagged = toPublicThreats({ entries: group(10, 1500) }, geo, model);
  assert.equal(allFlagged.points.length, 1000);
});

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const rows = () => [
  ...dataset().slice(0, 40),
  // things the model has never seen: a rare country, a missing ASN, an IPv6 address
  { ip: '2001:4860:4860::8888', country: 'NZ', asn: null, org: '', ageHours: 3 },
  { ip: '9.9.9.9', country: 'US', asn: 999999, org: 'Example Hosting', ageHours: 5000 },
];

test('an explanation adds up exactly: bias plus every contribution is the score', () => {
  const model = train(dataset());
  for (const row of rows()) {
    const e = explain(model, row);
    const total = e.bias + e.factors.reduce((sum, f) => sum + f.contribution, 0) + e.other;
    assert.ok(Math.abs(sigmoid(total) - score(model, row)) < 1e-12, `${row.ip}: ${sigmoid(total)} vs ${score(model, row)}`);
    assert.ok(Math.abs(e.score - score(model, row)) < 1e-12);
  }
});

test('an explanation lists the 3 strongest factors, biggest first, with human labels', () => {
  const model = train(dataset());
  const hosting = { ip: '30.1.1.1', country: 'US', asn: 101, org: 'Example Hosting', ageHours: 6 };
  const { factors } = explain(model, hosting);
  assert.equal(factors.length, 3);
  const sizes = factors.map((f) => Math.abs(f.contribution));
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  // the planted signal is "hosting networks send DoS traffic"
  assert.equal(factors[0].feature, 'hosting');
  assert.equal(factors[0].direction, 'raises');
  assert.equal(factors[0].label, 'Network name suggests hosting or cloud');
  for (const f of factors) assert.ok(/[a-z]{3} [a-z]/i.test(f.label) || /^Network AS\d+$/.test(f.label), f.label);

  const home = explain(model, { ...hosting, org: 'Example Net' }).factors[0];
  assert.deepEqual([home.feature, home.direction], ['hosting', 'lowers']);
});

test('country and network labels use names, not codes', () => {
  const model = train(dataset());
  const labels = explain(model, rows()[0], 200).factors.map((f) => f.label);
  assert.ok(labels.some((label) => /^Located in (United States|Germany|Brazil)$/.test(label)), labels.join('|'));
  assert.ok(labels.some((label) => /^Network AS1\d\d$/.test(label)));
});

test('the neutral report age is the average the model saw', () => {
  const model = train(dataset());
  const hours = neutralAgeHours(model);
  assert.ok(hours > 0 && hours < 24);
  const row = { ip: '9.9.9.9', country: 'US', asn: 101, org: 'Example Net' };
  const neutral = explain(model, { ...row, ageHours: hours }).factors.find((f) => f.feature === 'log_age_hours');
  assert.ok(!neutral || Math.abs(neutral.contribution) < 1e-9);
});
