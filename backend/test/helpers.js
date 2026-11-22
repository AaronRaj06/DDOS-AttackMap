import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config/index.js';

export const silent = { info() {}, error() {} };

export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dosmap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function testConfig(dir, env = {}) {
  return {
    ...loadConfig({ PORT: '0', ...env }),
    paths: {
      blacklist: join(dir, 'blacklist.json'),
      alerts: join(dir, 'alerts.json'),
      geo: join(dir, 'geo'),
      model: join(dir, 'model.json'),
      training: join(dir, 'labels.jsonl'),
      frontend: join(dir, 'dist'),
    },
  };
}

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const noGeo = {
  hasASN: false,
  hasCity: false,
  locate: (ip, country) => ({ country, lat: 10, lon: 20, precise: false, asn: null, org: '' }),
};
