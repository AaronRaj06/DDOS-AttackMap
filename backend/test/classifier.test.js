import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { averagePrecision, evaluate, loadModel, score, splitOf, train } from '../ml/classifier.js';
import { toPublicThreats } from '../services/threatFeed.js';
import { noGeo, silent, tempDir } from './helpers.js';

function seeded(seed = 7) {
  let state = seed;
  return () => ((state = (state * 16807) % 2147483647) / 2147483647);
}

// Synthetic data, only to prove the learner works. Says nothing about real-world accuracy.
function dataset({ signal = true, size = 2000 } = {}) {
  const random = seeded();
  return Array.from({ length: size }, (_, i) => {
    const hosting = random() < 0.3;
    return {
      ip: `${20 + (i % 150)}.${i >> 8}.${i & 255}.9`,
      country: ['US', 'DE', 'BR'][Math.floor(random() * 3)],
      asn: 100 + Math.floor(random() * 10),
      org: hosting ? 'Example Hosting' : 'Example Net',
      ageHours: random() * 24,
      ddos: random() < (!signal ? 0.25 : hosting ? 0.85 : 0.06),
    };
  });
}

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
