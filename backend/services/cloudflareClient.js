import { findCountry } from './countries.js';
import { UpstreamError, fetchJson } from './fetchJson.js';

const RADAR_API_BASE = 'https://api.cloudflare.com/client/v4/radar/attacks';
const SERVICE = 'Cloudflare Radar';
const unexpected = (what) => new UpstreamError(`${SERVICE} sent an unexpected ${what} response`);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parsePairs(result, layer) {
  if (!Array.isArray(result?.top_0)) throw unexpected(layer);
  return result.top_0.flatMap((row) => {
    const src = findCountry(row?.originCountryAlpha2);
    // The published layer 3 schema omits the target. Never guess one.
    const dst = findCountry(row?.targetCountryAlpha2);
    const share = Number(row?.value);
    return src && dst && Number.isFinite(share) && share > 0 ? [{ layer, src, dst, share }] : [];
  });
}

// Bucket name -> share, in the order Cloudflare sends it (duration and bitrate buckets are ordered)
export function parseDistribution(result) {
  if (!isObject(result?.summary_0)) throw unexpected('distribution');
  return Object.entries(result.summary_0)
    .map(([name, value]) => ({ name, share: Number(value) }))
    .filter(({ share }) => Number.isFinite(share) && share > 0);
}

export function parseVectors(result) {
  if (!isObject(result?.summary_0)) throw unexpected('vector');
  return parseDistribution(result).sort((a, b) => b.share - a.share).slice(0, 6);
}

// Where attacks land. Kept as its own list: layer 3 has no origin-to-target pairs.
export function parseTargets(result, layer) {
  if (!Array.isArray(result?.top_0)) throw unexpected(`${layer} target`);
  return result.top_0.flatMap((row) => {
    const country = findCountry(row?.targetCountryAlpha2);
    const share = Number(row?.value);
    return country && Number.isFinite(share) && share > 0 ? [{ layer, country, share }] : [];
  });
}

// `7d` and `7dcontrol` arrive as summary_0 (this week) and summary_1 (the week before)
export function parseTrend(result) {
  const now = result?.summary_0;
  const before = result?.summary_1;
  if (!isObject(now) || !isObject(before)) throw unexpected('week-over-week');
  return [...new Set([...Object.keys(now), ...Object.keys(before)])]
    .flatMap((name) => {
      const share = Number(now[name] ?? 0);
      const previous = Number(before[name] ?? 0);
      return Number.isFinite(share) && Number.isFinite(previous) ? [{ name, share, previous, change: share - previous }] : [];
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6);
}

// Layer 3 and 7 both return { serie_0: { timestamps, values } } with numeric strings
export function parseSeries(result, layer) {
  const serie = result?.serie_0;
  const { timestamps, values } = serie ?? {};
  if (!Array.isArray(timestamps) || !Array.isArray(values) || timestamps.length !== values.length) {
    throw unexpected(`${layer} timeseries`);
  }
  const points = [];
  timestamps.forEach((stamp, i) => {
    const t = Date.parse(stamp);
    const raw = values[i];
    const v = raw === null || raw === '' ? NaN : Number(raw);
    if (Number.isFinite(t) && Number.isFinite(v)) points.push({ t, v });
  });
  if (!points.length) throw unexpected(`${layer} timeseries`);
  return points.sort((a, b) => a.t - b.t);
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

  // Each part fails independently, so one broken endpoint does not blank the others.
  async getTrends() {
    const day = { dateRange: '1d', format: 'JSON' };
    // Without this filter layer 7 also counts WAF and bot-management blocks
    const ddos = { mitigationProduct: 'DDOS' };
    const series = { dateRange: '2d', aggInterval: '15m', format: 'JSON' };
    const requests = {
      l3: this.get('/layer3/top/attacks', { ...day, limit: '100' }).then((r) => parsePairs(r, 'l3')),
      l7: this.get('/layer7/top/attacks', { ...day, ...ddos, limit: '100' }).then((r) => parsePairs(r, 'l7')),
      vectors: this.get('/layer3/summary/VECTOR', day).then(parseVectors),
      seriesL3: this.get('/layer3/timeseries', series).then((r) => parseSeries(r, 'l3')),
      seriesL7: this.get('/layer7/timeseries', { ...series, ...ddos }).then((r) => parseSeries(r, 'l7')),
      targetsL3: this.get('/layer3/top/locations/target', { ...day, limit: '10' }).then((r) => parseTargets(r, 'l3')),
      targetsL7: this.get('/layer7/top/locations/target', { ...day, ...ddos, limit: '10' }).then((r) => parseTargets(r, 'l7')),
      duration: this.get('/layer3/summary/DURATION', day).then(parseDistribution),
      bitrate: this.get('/layer3/summary/BITRATE', day).then(parseDistribution),
      // Two dateRange values make two series. An array of pairs allows the repeated key.
      trend: this.get('/layer3/summary/VECTOR', [['dateRange', '7d'], ['dateRange', '7dcontrol'], ['format', 'JSON']]).then(parseTrend),
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
