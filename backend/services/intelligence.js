import { CloudflareRadarClient } from './cloudflareClient.js';
import { AbuseIPDBClient } from './abuseIPDB.js';
import { demoTrends } from './demoTrends.js';
import { poll } from './poll.js';
import { readCache, refreshBlacklist, toPublicThreats } from './threatFeed.js';

const RADAR_REFRESH_MS = 15 * 60 * 1000;
const RADAR_RETRY_MS = 2 * 60 * 1000;

// Owns everything that comes from upstream sources, and says how trustworthy it is right now.
export class Intelligence {
  constructor({ config, geo, model, fetch, onChange = () => {}, log = console }) {
    Object.assign(this, { config, geo, model, onChange, log });
    this.radarClient = config.cloudflareToken ? new CloudflareRadarClient(config.cloudflareToken, { fetch }) : null;
    this.abuseClient = config.abuseKey ? new AbuseIPDBClient(config.abuseKey, { fetch }) : null;
    this.parts = { l3: [], l7: [], vectors: [] };
    this.routes = this.radarClient ? [] : demoTrends();
    this.threats = { total: 0, flagged: 0, points: [] };
    this.radar = { state: this.radarClient ? 'loading' : 'not_configured', updatedAt: null, error: null };
    this.abuse = { state: this.abuseClient ? 'loading' : 'not_configured', updatedAt: null, error: null };
    this.stops = [];
  }

  async refreshRadar() {
    const { data, errors } = await this.radarClient.getTrends();
    Object.assign(this.parts, data);
    this.routes = [...this.parts.l3, ...this.parts.l7];

    const updated = Object.keys(data).length > 0;
    if (updated) this.radar.updatedAt = new Date().toISOString();
    this.radar.error = errors[0]?.message ?? null;
    if (!errors.length) this.radar.state = 'ok';
    else if (updated) this.radar.state = 'partial';
    else this.radar.state = this.radar.updatedAt ? 'stale' : 'error';

    if (errors.length) this.log.error(this.radar.error);
    this.onChange();
    return errors.length ? Math.max(RADAR_RETRY_MS, errors[0].retryAfterMs ?? 0) : RADAR_REFRESH_MS;
  }

  showBlacklist(cache) {
    this.threats = toPublicThreats(cache, this.geo, this.model);
    this.abuse.updatedAt = cache.generatedAt ?? null;
    this.abuse.error = cache.error ?? null;
    if (cache.error) this.abuse.state = cache.entries.length ? 'stale' : 'error';
    else this.abuse.state = cache.generatedAt ? 'ok' : 'loading';
  }

  async refreshThreats() {
    const { cache, delay } = await refreshBlacklist({ client: this.abuseClient, file: this.config.paths.blacklist });
    this.showBlacklist(cache);
    if (cache.error) this.log.error(cache.error);
    this.onChange();
    return delay;
  }

  async start() {
    if (this.abuseClient) {
      this.showBlacklist(await readCache(this.config.paths.blacklist));
      this.stops.push(poll(() => this.refreshThreats(), { log: this.log }));
    }
    if (this.radarClient) this.stops.push(poll(() => this.refreshRadar(), { log: this.log }));
  }

  stop() {
    for (const stop of this.stops) stop();
  }

  status() {
    const classifier = !this.model ? 'untrained' : this.geo.hasASN ? 'active' : 'needs_geo_database';
    let mode = 'demo';
    if (this.radarClient) mode = this.routes.length ? 'live' : 'unavailable';
    return {
      mode,
      radar: { ...this.radar },
      abuse: { ...this.abuse },
      geo: this.geo.hasCity ? 'city' : 'country',
      classifier: { state: classifier, metrics: this.model?.metrics ?? null },
    };
  }

  snapshot() {
    return {
      status: this.status(),
      vectors: this.parts.vectors,
      corridors: ['l3', 'l7'].flatMap((layer) =>
        this.routes.filter((route) => route.layer === layer).sort((a, b) => b.share - a.share).slice(0, 5)),
      threats: this.threats,
    };
  }
}
