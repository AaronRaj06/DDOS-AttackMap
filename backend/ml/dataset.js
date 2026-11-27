import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { toRow } from './features.js';

export async function readDataset(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return text.split('\n').filter(Boolean).map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`${file}:${i + 1} is not valid JSON`);
    }
  });
}

// Appends as it goes, so an interrupted run loses nothing it paid quota for.
export async function collect({ client, geo, blacklist, file, limit = 950, random = Math.random, log = console }) {
  const seen = new Set((await readDataset(file)).map((row) => row.ip));
  const fresh = blacklist.entries.filter((entry) => !seen.has(entry.ip));
  // Random sample: the list is ordered, and its head alone would bias the labels
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  await mkdir(dirname(file), { recursive: true });

  let added = 0;
  let failures = 0;
  for (const entry of fresh.slice(0, limit)) {
    try {
      const { ddos, remaining } = await client.getDdosLabel(entry.ip);
      const row = toRow(entry, geo.locate(entry.ip, entry.country), blacklist.generatedAt);
      await appendFile(file, `${JSON.stringify({ ...row, ddos })}\n`);
      added++;
      failures = 0;
      if (remaining <= 0) break;
    } catch (error) {
      if (error.name !== 'UpstreamError') throw error;
      log.error(error.message);
      if ([401, 403, 429].includes(error.status) || ++failures >= 5) break;
    }
  }
  return { added, total: seen.size + added };
}
