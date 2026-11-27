// Reproduces the detection table in the README. Simulated traffic, not real attacks.
import { detect } from '../services/spikes.js';

const STEP = 900_000;
const T0 = Date.UTC(2026, 10, 20);
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const noise = {
  'gaussian (15%)': (r) => 100 * (1 + 0.15 * gauss(r)),
  'daily cycle (25%) + 10% noise': (r, i) => 100 * (1 + 0.25 * Math.sin((2 * Math.PI * i) / 96) + 0.1 * gauss(r)),
  'skewed (log-normal, sigma 0.3)': (r) => 100 * Math.exp(0.3 * gauss(r)),
};
const RUNS = 300;

function run(make, seedBase, multiplier = 1, length = 0) {
  let found = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seedBase + seed);
    const data = Array.from({ length: 288 }, (_, i) => ({
      t: T0 + i * STEP,
      v: Math.max(0, make(r, i)) * (i >= 200 && i < 200 + length ? multiplier : 1),
    }));
    found += detect(data).spikes.length > 0 ? 1 : 0;
  }
  return `${Math.round((found / RUNS) * 100)}%`;
}

console.log(`${RUNS} simulated 3-day series per row\n`);
console.log('noise'.padEnd(34), 'false alarms'.padEnd(14), '3x for 2 h'.padEnd(12), '2x for 90 min');
for (const [name, make] of Object.entries(noise)) {
  const falseAlarms = Math.round((parseInt(run(make, 0), 10) / 100) * RUNS);
  console.log(name.padEnd(34), `${falseAlarms} of ${RUNS}`.padEnd(14), run(make, 5000, 3, 8).padEnd(12), run(make, 5000, 2, 6));
}
