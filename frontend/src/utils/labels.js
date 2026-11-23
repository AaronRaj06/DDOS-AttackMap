export const LAYER_LABELS = { l3: 'Network layer (L3/4)', l7: 'Application layer (L7)' };
export const LAYER_SHORT = { l3: 'Network', l7: 'Application' };

// Radar names size buckets like UNDER_10_MINS or _500_MBPS_TO_1_GBPS
export function humanizeBucket(name) {
  const text = String(name).replace(/^_+/, '').replaceAll('_', ' ').trim().toLowerCase()
    .replace(/\b(\d+) (\d+)\b/, '$1–$2')
    .replace(/\b([mgt])bps\b/g, (_, unit) => `${unit.toUpperCase()}bps`)
    .replace(/\bmins\b/, 'min');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const formatShare = (value) => `${value.toFixed(1)}%`;
export const formatChange = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} pts`;

export function formatUtc(iso) {
  return Number.isNaN(Date.parse(iso)) ? '' : `${new Date(iso).toISOString().slice(5, 16).replace('T', ' ')} UTC`;
}

export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export function spikeSentence(spike) {
  const size = spike.ratio ? `${spike.ratio}x its recent level` : 'far above its recent level';
  const when = spike.active ? `since ${formatUtc(spike.start)}` : `${formatUtc(spike.start)} to ${formatUtc(spike.end)}`;
  return `${LAYER_LABELS[spike.layer]} reached ${size}, ${when}`;
}

// weight x standardized value, signed, for the "why flagged" list
export const formatContribution = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
