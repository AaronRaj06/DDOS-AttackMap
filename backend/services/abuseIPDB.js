import { isIP } from 'node:net';
import { UpstreamError, fetchJson } from './fetchJson.js';

const API_BASE = 'https://api.abuseipdb.com/api/v2';
const SERVICE = 'AbuseIPDB';
export const DDOS_CATEGORY = 4;

export class AbuseIPDBClient {
  constructor(key, { fetch } = {}) {
    this.key = key;
    this.fetch = fetch;
  }

  get(path, params) {
    return fetchJson(`${API_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Key: this.key, Accept: 'application/json' },
      fetch: this.fetch,
      service: SERVICE,
    });
  }

  // Free tier: 5 calls a day, up to 10,000 IPs per call
  async getBlacklist() {
    const { body } = await this.get('/blacklist', { limit: '10000' });
    if (!Array.isArray(body?.data)) throw new UpstreamError(`${SERVICE} sent an unexpected blacklist`, { status: 200 });
    const generated = Date.parse(body.meta?.generatedAt);
    return {
      generatedAt: new Date(Number.isNaN(generated) ? Date.now() : generated).toISOString(),
      entries: body.data
        .filter((row) => isIP(row?.ipAddress ?? ''))
        .map((row) => ({ ip: row.ipAddress, country: row.countryCode ?? null, reportedAt: row.lastReportedAt ?? null })),
    };
  }

  // Free tier: 1,000 calls a day. Used only to label training data.
  async getDdosLabel(ip) {
    const { body, headers } = await this.get('/check', { ipAddress: ip, maxAgeInDays: '90', verbose: 'true' });
    if (!Array.isArray(body?.data?.reports)) throw new UpstreamError(`${SERVICE} sent no reports`, { status: 200 });
    return {
      ddos: body.data.reports.some((report) => report.categories?.includes(DDOS_CATEGORY)),
      remaining: Number(headers.get('x-ratelimit-remaining') ?? Infinity),
    };
  }
}
