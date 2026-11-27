import assert from 'node:assert/strict';
import { test } from 'node:test';
// The server's own explanation code: the tour's bars must add up the way it does
import { explain } from '../../backend/ml/classifier.js';
import { featureNames } from '../../backend/ml/features.js';
import { NETWORKS, THRESHOLD } from '../src/tour/illustrative.js';
import { pickNetworks, scoreOf } from '../src/tour/score.js';

test('the factor bars add up to the score the server reports: sigmoid(bias + factors + other)', () => {
  const vocabulary = { countries: ['NL', 'US'], asns: [64500] };
  const features = featureNames(vocabulary);
  const model = {
    vocabulary, features, bias: -0.7,
    weights: features.map((_, i) => ((i * 37) % 11) / 10 - 0.5),
    mean: features.map((_, i) => (i % 3) / 10),
    std: features.map(() => 0.8),
  };
  for (const row of [
    { ip: '203.0.113.7', org: 'Example Hosting BV', country: 'NL', asn: 64500, ageHours: 3 },
    { ip: '2001:db8::1', org: 'Example Broadband', country: 'DE', asn: null, ageHours: 400 },
  ]) {
    const explanation = explain(model, row);
    assert.ok(Math.abs(scoreOf(explanation) - explanation.score) < 1e-12);
  }
});

test('the illustrative networks are consistent: two sides of the threshold, three factors each', () => {
  const scores = NETWORKS.map((n) => scoreOf(n.explanation));
  assert.ok(scores.some((s) => s >= THRESHOLD) && scores.some((s) => s < THRESHOLD));
  for (const { explanation } of NETWORKS) {
    assert.equal(explanation.factors.length, 3);
    for (const f of explanation.factors) assert.equal(f.direction, f.contribution >= 0 ? 'raises' : 'lowers');
  }
});

test('the networks to inspect: likeliest flagged first, then the least likely, one per network', () => {
  const p = (network, dosScore, flagged) => ({ network, dosScore, flagged });
  const points = [p('a', 0.9, true), p('a', 0.95, true), p('b', 0.8, true), p('c', 0.7, true), p('d', 0.6, true),
    p('e', 0.3, false), p('f', 0.1, false), p('g', 0.05, false), { network: 'h', dosScore: null, flagged: false }];
  assert.deepEqual(pickNetworks(points).map((x) => x.network), ['a', 'b', 'c', 'f', 'g']);
  assert.deepEqual(pickNetworks([p('x', 0.2, false)]).map((x) => x.network), ['x']);
  assert.deepEqual(pickNetworks([]), []);
});

test('the output cards show exactly what the server sends', async () => {
  const { formatSpike } = await import('../../backend/services/alerts.js');
  const { renderMetrics } = await import('../../backend/services/metrics.js');
  const { exampleSpike, outputExamples } = await import('../src/tour/content.js');

  assert.equal(outputExamples['Slack-compatible webhook'], JSON.stringify({ text: formatSpike(exampleSpike) }).replace('{"text":', '{"text": '));
  const metrics = renderMetrics({
    radar: { state: 'ok', updatedAt: exampleSpike.start }, abuse: { state: 'ok', updatedAt: exampleSpike.start },
    clients: 0, events: 0, spikes: [exampleSpike], uptime: 1, memory: { rss: 1, heapUsed: 1 },
  }).split('\n');
  for (const line of outputExamples['Prometheus /metrics'].split('\n')) assert.ok(metrics.includes(line), `not a line the server prints: ${line}`);
});
