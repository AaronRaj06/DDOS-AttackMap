import { createHash, timingSafeEqual } from 'node:crypto';

const SOURCE_STATES = ['not_configured', 'loading', 'ok', 'partial', 'stale', 'error'];
const LAYERS = ['l3', 'l7'];

const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const labelText = (labels) => {
  const entries = Object.entries(labels);
  return entries.length ? `{${entries.map(([key, value]) => `${key}="${escape(value)}"`).join(',')}}` : '';
};
const seconds = (iso) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms / 1000 : 0;
};

// Hashing first makes both sides the same length, so the comparison leaks neither content nor length
export function bearerMatches(header, token) {
  const given = /^Bearer (.+)$/i.exec(header ?? '')?.[1] ?? '';
  return timingSafeEqual(createHash('sha256').update(given).digest(), createHash('sha256').update(token).digest());
}

// Prometheus text format 0.0.4, written by hand to avoid a dependency
export function renderMetrics({ radar, abuse, clients, events, spikes, uptime, memory }) {
  const out = [];
  const metric = (name, type, help, samples) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const [labels, value] of samples) out.push(`${name}${labelText(labels)} ${Number.isFinite(value) ? value : 0}`);
  };

  metric('dosmap_radar_last_success_timestamp_seconds', 'gauge',
    'Unix time of the last Cloudflare Radar refresh that returned data, 0 if none yet', [[{}, seconds(radar.updatedAt)]]);
  metric('dosmap_abuseipdb_last_success_timestamp_seconds', 'gauge',
    'Unix time AbuseIPDB generated the blacklist now in use, 0 if none', [[{}, seconds(abuse.updatedAt)]]);
  metric('dosmap_source_state', 'gauge', '1 for the current state of each data source and 0 for the others',
    [['radar', radar.state], ['abuseipdb', abuse.state]].flatMap(([source, current]) =>
      [...new Set([...SOURCE_STATES, current])].map((state) => [{ source, state }, state === current ? 1 : 0])));
  metric('dosmap_websocket_clients', 'gauge', 'Open WebSocket connections', [[{}, clients]]);
  metric('dosmap_events_replayed_total', 'counter', 'Events replayed to clients since start', [[{}, events]]);
  metric('dosmap_active_spikes', 'gauge', 'Traffic spikes running now, by layer',
    LAYERS.map((layer) => [{ layer }, spikes.filter((spike) => spike.layer === layer).length]));
  metric('dosmap_uptime_seconds', 'gauge', 'Seconds since the process started', [[{}, uptime]]);
  metric('dosmap_process_resident_memory_bytes', 'gauge', 'Resident memory size', [[{}, memory.rss]]);
  metric('dosmap_process_heap_used_bytes', 'gauge', 'V8 heap in use', [[{}, memory.heapUsed]]);
  return `${out.join('\n')}\n`;
}
