import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { score } from '../ml/classifier.js';
import { toRow } from '../ml/features.js';
import { networkOf } from './ip.js';

export const REFRESH_MS = 6 * 60 * 60 * 1000; // 4 a day, under the limit of 5
const NETWORK_RETRY_MS = 15 * 60 * 1000;
const AUTH_RETRY_MS = 60 * 1000;
const PUBLIC_LIMIT = 1000;

export async function readCache(file) {
  try {
    const cache = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(cache.entries) ? cache : { entries: [] };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { entries: [] };
    throw error;
  }
}

async function writeCache(file, cache) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(cache));
  await rename(`${file}.tmp`, file);
}

function retryDelay({ status, retryAfterMs }) {
  // No status never reached the API, and a rejected key spends no quota
  if (!status) return NETWORK_RETRY_MS;
  if (status === 401 || status === 403) return AUTH_RETRY_MS;
  return Math.max(REFRESH_MS, retryAfterMs ?? 0);
}

// The schedule is stored on disk: restarts must not spend the five daily calls.
export async function refreshBlacklist({ client, file, now = Date.now }) {
  const cache = await readCache(file);
  if (cache.nextAttempt > now()) return { cache, delay: cache.nextAttempt - now() };

  // Reserve the slot before calling, in case the process dies mid-request
  cache.nextAttempt = now() + REFRESH_MS;
  await writeCache(file, cache);
  try {
    Object.assign(cache, await client.getBlacklist(), { error: null });
  } catch (error) {
    if (error.name !== 'UpstreamError') throw error;
    cache.error = error.message;
    cache.nextAttempt = now() + retryDelay(error);
  }
  await writeCache(file, cache);
  return { cache, delay: cache.nextAttempt - now() };
}

export function toPublicThreats({ entries, generatedAt }, geo, model) {
  // The model learned from ASN features, so it cannot run without that database
  const active = model && geo.hasASN ? model : null;
  const threats = [];
  for (const entry of entries) {
    const place = geo.locate(entry.ip, entry.country);
    if (place.lat === null || place.lon === null) continue;
    const dosScore = active ? score(active, toRow(entry, place, generatedAt)) : null;
    threats.push({
      network: networkOf(entry.ip),
      country: place.country,
      lat: Number(place.lat.toFixed(2)),
      lon: Number(place.lon.toFixed(2)),
      precise: place.precise,
      reportedAt: entry.reportedAt,
      dosScore,
      flagged: active ? dosScore >= active.threshold : false,
    });
  }
  const recentFirst = (a, b) => (Date.parse(b.reportedAt) || 0) - (Date.parse(a.reportedAt) || 0);
  const likely = threats.filter((threat) => threat.flagged).sort((a, b) => b.dosScore - a.dosScore);
  const others = threats.filter((threat) => !threat.flagged).sort(recentFirst);
  // Half the dots at most are flagged, unless there is nothing else to show
  const shown = likely.slice(0, Math.max(PUBLIC_LIMIT / 2, PUBLIC_LIMIT - others.length));
  const points = [...shown, ...others.slice(0, PUBLIC_LIMIT - shown.length)];
  return { total: threats.length, flagged: likely.length, points };
}
