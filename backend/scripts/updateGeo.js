import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import * as maxmind from 'maxmind';
import { loadConfig } from '../config/index.js';

const dir = loadConfig().paths.geo;
const now = new Date();
// This month's file can be missing on the 1st, so fall back one month
const months = [0, 1].map((back) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 7));

async function update(kind) {
  for (const month of months) {
    const response = await fetch(`https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz`, {
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      continue;
    }
    const target = join(dir, `${kind}.mmdb`);
    const temp = `${target}.tmp`;
    try {
      await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(temp));
      await maxmind.open(temp); // never replace a good database with a broken download
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true });
    }
    console.log(`Installed DB-IP ${kind} ${month}`);
    return;
  }
  throw new Error(`No DB-IP ${kind} download is available`);
}

await mkdir(dir, { recursive: true });
await update('city');
await update('asn');
console.log('Done. Restart the server to use it. IP geolocation by DB-IP (https://db-ip.com), CC BY 4.0.');
