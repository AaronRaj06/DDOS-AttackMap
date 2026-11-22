import { findCountry } from './countries.js';
import { UpstreamError, fetchJson } from './fetchJson.js';

const RADAR_API_BASE = 'https://api.cloudflare.com/client/v4/radar/attacks';
const SERVICE = 'Cloudflare Radar';

export function parsePairs(result, layer) {
  if (!Array.isArray(result?.top_0)) throw new UpstreamError(`${SERVICE} sent an unexpected ${layer} response`);
  return result.top_0.flatMap((row) => {
    const src = findCountry(row?.originCountryAlpha2);
    // The published layer 3 schema omits the target. Never guess one.
    const dst = findCountry(row?.targetCountryAlpha2);
    const share = Number(row?.value);
    return src && dst && Number.isFinite(share) && share > 0 ? [{ layer, src, dst, share }] : [];
  });
}

export function parseVectors(result) {
  if (!result?.summary_0 || typeof result.summary_0 !== 'object') {
    throw new UpstreamError(`${SERVICE} sent an unexpected vector response`);
  }
  return Object.entries(result.summary_0)
    .map(([name, value]) => ({ name, share: Number(value) }))
    .filter(({ share }) => Number.isFinite(share) && share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);
}

export class CloudflareRadarClient {
  constructor(token, { fetch } = {}) {
    this.token = token;
    this.fetch = fetch;
  }

  async get(path, params) {
    const { body } = await fetchJson(`${RADAR_API_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      fetch: this.fetch,
      service: SERVICE,
    });
    if (body?.success !== true) throw new UpstreamError(`${SERVICE} reported a failure`);
    return body.result;
  }

  // Each part fails independently, so one broken endpoint does not blank the map.
  async getTrends() {
    const common = { dateRange: '1d', format: 'JSON' };
    const pairs = { ...common, limit: '100' };
    const requests = {
      l3: this.get('/layer3/top/attacks', pairs).then((r) => parsePairs(r, 'l3')),
      // Without this filter layer 7 also counts WAF and bot-management blocks
      l7: this.get('/layer7/top/attacks', { ...pairs, mitigationProduct: 'DDOS' }).then((r) => parsePairs(r, 'l7')),
      vectors: this.get('/layer3/summary/VECTOR', common).then(parseVectors),
    };
    const settled = await Promise.allSettled(Object.values(requests));
    const data = {};
    const errors = [];
    Object.keys(requests).forEach((part, i) => {
      if (settled[i].status === 'fulfilled') data[part] = settled[i].value;
      else errors.push(settled[i].reason);
    });
    return { data, errors };
  }
}
