import { CloudflareRadarClient } from './cloudflareClient.js';
import { AbuseIPDBClient } from './abuseIPDB.js';
import { demoTrends } from './demoTrends.js';
import { explain, neutralAgeHours, score } from '../ml/classifier.js';
import { findCountry } from './countries.js';
import { networkOf } from './ip.js';
import { poll } from './poll.js';
import { SeriesStore } from './seriesStore.js';
import { detect, layerStatus, serializeSpike, summarize } from './spikes.js';
import { readCache, refreshBlacklist, toPublicThreats } from './threatFeed.js';

const RADAR_REFRESH_MS = 15 * 60 * 1000;
const RADAR_RETRY_MS = 2 * 60 * 1000;
const STALE_MS = 30 * 24 * 3600_000;
const SERIES_PARTS = { seriesL3: 'l3', seriesL7: 'l7' };

// Owns everything that comes from upstream sources, and says how trustworthy it is right now.
export class Intelligence {
  constructor({ config, geo, model, fetch, notifier = null, onChange = () => {}, onSeries = () => {}, now = Date.now, log = console }) {
    Object.assign(this, { config, geo, model, notifier, onChange, onSeries, now, log });
    this.radarClient = config.cloudflareToken ? new CloudflareRadarClient(config.cloudflareToken, { fetch }) : null;
    this.abuseClient = config.abuseKey ? new AbuseIPDBClient(config.abuseKey, { fetch }) : null;
    this.parts = { l3: [], l7: [], vectors: [], targetsL3: [], targetsL7: [], duration: [], bitrate: [], trend: [] };
    this.series = new SeriesStore();
    this.detected = { l3: null, l7: null };
    this.routes = this.radarClient ? [] : demoTrends();
    this.threats = { total: 0, flagged: 0, points: [] };
    this.networkIndex = new Map();
    this.radar = { state: this.radarClient ? 'loading' : 'not_configured', updatedAt: null, error: null };
    this.abuse = { state: this.abuseClient ? 'loading' : 'not_configured', updatedAt: null, error: null };
    this.stops = [];
  }

  analyze() {
    for (const layer of Object.keys(this.detected)) this.detected[layer] = detect(this.series.points(layer));
  }

  // History from MongoDB after a restart, so a spike has a baseline straight away
  restoreSeries(layer, points) {
    if (!points.length) return;
    this.series.add(layer, points);
    this.analyze();
    this.onChange();
  }

  async refreshRadar() {
    const { data, errors } = await this.radarClient.getTrends();
    let reanalyze = false;
    for (const [part, value] of Object.entries(data)) {
      if (part in SERIES_PARTS) {
        this.series.add(SERIES_PARTS[part], value);
        this.onSeries(SERIES_PARTS[part], value);
        reanalyze = true;
      } else {
        this.parts[part] = value;
      }
    }
    this.routes = [...this.parts.l3, ...this.parts.l7];
    if (reanalyze) this.analyze();

    const updated = Object.keys(data).length > 0;
    if (updated) this.radar.updatedAt = new Date().toISOString();
    this.radar.error = errors[0]?.message ?? null;
    if (!errors.length) this.radar.state = 'ok';
    else if (updated) this.radar.state = 'partial';
    else this.radar.state = this.radar.updatedAt ? 'stale' : 'error';

    if (errors.length) this.log.error(this.radar.error);
    this.onChange();
    // After the broadcast, so a slow webhook never delays the dashboard
    await this.notifier?.consider(this.spikeSummary().active);
    return errors.length ? Math.max(RADAR_RETRY_MS, errors[0].retryAfterMs ?? 0) : RADAR_REFRESH_MS;
  }

  showBlacklist(cache) {
    const { index, ...threats } = toPublicThreats(cache, this.geo, this.model);
    this.threats = threats;
    this.networkIndex = index;
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

  // Which model is scoring, how it was tested, and whether to trust it
  classifierStatus() {
    const { model } = this;
    if (!model) return { state: 'untrained', metrics: null };
    const age = this.now() - Date.parse(model.trainedAt);
    let state = 'active';
    if (!this.geo.hasASN) state = 'needs_geo_database';
    else if (!(age <= STALE_MS)) state = 'stale'; // also true for an unreadable date
    return {
      state,
      trainedAt: model.trainedAt,
      ageDays: Number.isFinite(age) ? Math.max(0, Math.floor(age / 86_400_000)) : null,
      threshold: model.threshold,
      samples: model.metrics.samples,
      metrics: model.metrics,
    };
  }

  // Offline: geolocation, ASN and the model. Membership is only ever reported for the whole
  // /24 or /48, because an exact-IP answer would let anyone rebuild the blacklist by probing.
  lookup(ip) {
    const place = this.geo.locate(ip, null);
    const network = networkOf(ip);
    const listed = this.networkIndex.get(network);
    const active = this.model && this.geo.hasASN ? this.model : null;
    const classifier = { state: this.classifierStatus().state, score: null, flagged: null, threshold: null, basis: null };
    if (active) {
      // An unlisted IP has no report age, so that one feature is set to the training average
      const row = { ip, country: place.country, asn: place.asn, org: place.org, ageHours: listed ? listed.row.ageHours : neutralAgeHours(active) };
      const value = score(active, row);
      Object.assign(classifier, { score: value, flagged: value >= active.threshold, threshold: active.threshold, basis: listed ? 'listed_network' : 'neutral_age' });
    }
    return {
      ip,
      network,
      country: place.country,
      countryName: findCountry(place.country)?.name ?? null,
      city: place.city ?? null,
      lat: place.lat === null ? null : Number(place.lat.toFixed(2)),
      lon: place.lon === null ? null : Number(place.lon.toFixed(2)),
      precise: place.precise,
      asn: place.asn,
      org: place.org,
      networkListed: Boolean(listed),
      classifier,
    };
  }

  // Why one network is flagged. Null when the network is not in the cached blacklist.
  explainNetwork(network) {
    const found = this.networkIndex.get(network);
    if (!found) return null;
    const active = this.model && this.geo.hasASN ? this.model : null;
    return {
      network,
      country: found.row.country,
      asn: found.row.asn,
      org: found.row.org,
      precise: found.precise,
      reportedAt: found.reportedAt,
      dosScore: found.dosScore,
      flagged: found.flagged,
      threshold: active?.threshold ?? null,
      explanation: active ? explain(active, found.row) : null,
    };
  }

  status() {
    let mode = 'demo';
    if (this.radarClient) mode = this.routes.length ? 'live' : 'unavailable';
    return {
      mode,
      radar: { ...this.radar },
      abuse: { ...this.abuse },
      geo: this.geo.hasCity ? 'city' : 'country',
      classifier: this.classifierStatus(),
      // Whether alerts are on, never where they go
      alerts: { enabled: Boolean(this.notifier), lastSentAt: this.notifier?.lastSentIso() ?? null },
    };
  }

  spikeSummary() {
    return summarize(this.detected);
  }

  timeline(layer, limit) {
    const result = this.detected[layer];
    return {
      status: layerStatus(result),
      points: this.series.points(layer).slice(-limit).map(({ t, v }) => ({ t: new Date(t).toISOString(), v })),
      spikes: (result?.spikes ?? []).map((spike) => serializeSpike(layer, spike)),
    };
  }

  snapshot() {
    return {
      status: this.status(),
      spikes: this.spikeSummary(),
      vectors: this.parts.vectors,
      trend: this.parts.trend,
      sizes: { duration: this.parts.duration, bitrate: this.parts.bitrate },
      targets: { l3: this.parts.targetsL3, l7: this.parts.targetsL7 },
      corridors: ['l3', 'l7'].flatMap((layer) =>
        this.routes.filter((route) => route.layer === layer).sort((a, b) => b.share - a.share).slice(0, 5)),
      threats: this.threats,
    };
  }
}
