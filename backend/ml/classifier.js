import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { networkOf } from '../services/ip.js';
import { buildVocabulary, featureLabel, featureNames, featurize } from './features.js';

const MIN_ROWS = 500;
const MIN_PER_CLASS = { train: 30, validation: 10, test: 10 };
const MIN_LIFT = 1.2;

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

// A network lands wholly in one split, so neighboring IPs cannot leak into the test set.
export function splitOf(ip) {
  const bucket = createHash('sha256').update(networkOf(ip)).digest().readUInt32BE(0) % 100;
  if (bucket < 70) return 'train';
  return bucket < 85 ? 'validation' : 'test';
}

export function averagePrecision(scores, labels) {
  const ranked = scores.map((score, i) => [score, labels[i]]).sort((a, b) => b[0] - a[0]);
  const positives = labels.filter(Boolean).length;
  if (!positives) return 0;
  let hits = 0;
  let total = 0;
  for (let i = 0; i < ranked.length;) {
    // Tied scores count together, otherwise input order inflates the result
    let end = i;
    let gained = 0;
    while (end < ranked.length && ranked[end][0] === ranked[i][0]) gained += Number(ranked[end++][1]);
    hits += gained;
    total += (gained / positives) * (hits / end);
    i = end;
  }
  return total;
}

export function evaluate(scores, labels, threshold) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  scores.forEach((score, i) => {
    if (score >= threshold) labels[i] ? tp++ : fp++;
    else labels[i] ? fn++ : tn++;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn, tn };
}

function fit(X, y) {
  const n = X.length;
  const width = X[0].length;
  const mean = Array.from({ length: width }, (_, j) => X.reduce((sum, x) => sum + x[j], 0) / n);
  const std = mean.map((m, j) => Math.sqrt(X.reduce((sum, x) => sum + (x[j] - m) ** 2, 0) / n) || 1);
  const scaled = X.map((x) => x.map((value, j) => (value - mean[j]) / std[j]));
  const positives = y.filter(Boolean).length;
  const classWeight = [n / (2 * (n - positives)), n / (2 * positives)];
  const weights = Array(width).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < 400; epoch++) {
    const gradient = Array(width).fill(0);
    let biasGradient = 0;
    scaled.forEach((x, i) => {
      const error = (sigmoid(dot(x, weights) + bias) - y[i]) * classWeight[y[i]];
      for (let j = 0; j < width; j++) gradient[j] += error * x[j];
      biasGradient += error;
    });
    for (let j = 0; j < width; j++) weights[j] -= 0.1 * (gradient[j] / n + 0.01 * weights[j]);
    bias -= 0.1 * (biasGradient / n);
  }
  return { mean, std, weights, bias };
}

export function score(model, row) {
  const x = featurize(row, model.vocabulary).map((value, j) => (value - model.mean[j]) / model.std[j]);
  return sigmoid(dot(x, model.weights) + model.bias);
}

// Each feature adds weight x standardized value to the logit, so the parts are exact:
// sigmoid(bias + every contribution) is the score. `other` is what the hidden ones add up to.
export function explain(model, row, top = 3) {
  const x = featurize(row, model.vocabulary);
  const parts = model.features.map((feature, j) => ({
    feature,
    label: featureLabel(feature),
    contribution: (model.weights[j] * (x[j] - model.mean[j])) / model.std[j],
  }));
  const ranked = [...parts].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    score: sigmoid(model.bias + parts.reduce((sum, part) => sum + part.contribution, 0)),
    bias: model.bias,
    factors: ranked.slice(0, top).map((part) => ({ ...part, direction: part.contribution >= 0 ? 'raises' : 'lowers' })),
    other: ranked.slice(top).reduce((sum, part) => sum + part.contribution, 0),
  };
}

// The report-age feature the model would see on average, for IPs that have no report
export function neutralAgeHours(model) {
  return Math.expm1(model.mean[model.features.indexOf('log_age_hours')]);
}

// Threshold is picked on validation by F0.5 (precision counts double); test is only reported.
function pickThreshold(scores, labels) {
  let best = { value: -1, threshold: 0.5 };
  for (const threshold of new Set(scores)) {
    const { precision, recall } = evaluate(scores, labels, threshold);
    const value = precision + recall ? (1.25 * precision * recall) / (0.25 * precision + recall) : 0;
    if (value > best.value || (value === best.value && threshold > best.threshold)) best = { value, threshold };
  }
  return best.threshold;
}

export function train(rows) {
  if (rows.length < MIN_ROWS) throw new Error(`Need at least ${MIN_ROWS} labeled IPs, have ${rows.length}`);
  const sets = { train: [], validation: [], test: [] };
  for (const row of rows) sets[splitOf(row.ip)].push(row);

  const labels = {};
  for (const [name, set] of Object.entries(sets)) {
    labels[name] = set.map((row) => Number(row.ddos));
    const positive = labels[name].filter(Boolean).length;
    const min = MIN_PER_CLASS[name];
    if (positive < min || set.length - positive < min) {
      throw new Error(`The ${name} split needs ${min} IPs of each class, has ${positive} DDoS and ${set.length - positive} other. Collect more data.`);
    }
  }

  const vocabulary = buildVocabulary(sets.train);
  const model = {
    vocabulary,
    features: featureNames(vocabulary),
    ...fit(sets.train.map((row) => featurize(row, vocabulary)), labels.train),
  };
  const scores = (name) => sets[name].map((row) => score(model, row));
  model.threshold = pickThreshold(scores('validation'), labels.validation);

  const tested = scores('test');
  const baseline = labels.test.filter(Boolean).length / labels.test.length;
  const ap = averagePrecision(tested, labels.test);
  model.metrics = {
    ...evaluate(tested, labels.test, model.threshold),
    averagePrecision: ap,
    baseline,
    samples: { train: sets.train.length, validation: sets.validation.length, test: sets.test.length },
  };
  model.useful = ap >= Math.min(baseline * MIN_LIFT, 0.99);
  model.trainedAt = new Date().toISOString();
  return model;
}

export function loadModel(file, { log = console } = {}) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') log.error(`Cannot read the model: ${error.message}`);
    return null;
  }
  try {
    const model = JSON.parse(text);
    const width = featureNames(model.vocabulary).length;
    const valid = ['weights', 'mean', 'std'].every((key) => model[key].length === width)
      && Number.isFinite(model.bias) && Number.isFinite(model.threshold) && model.useful === true;
    if (valid) return model;
  } catch {
    // reported below
  }
  log.error('Ignoring an invalid model file. Run `npm run ml:train` again.');
  return null;
}
