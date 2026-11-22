import { writeFile } from 'node:fs/promises';
import { loadConfig } from '../config/index.js';
import { train } from '../ml/classifier.js';
import { readDataset } from '../ml/dataset.js';

const { paths } = loadConfig();
try {
  const model = train(await readDataset(paths.training));
  console.log('Held-out test metrics:', model.metrics);
  if (!model.useful) throw new Error('No better than guessing (average precision is near the baseline), so it was not saved.');
  await writeFile(paths.model, `${JSON.stringify(model, null, 2)}\n`);
  console.log('Saved ml/model.json. Restart the server to use it.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
