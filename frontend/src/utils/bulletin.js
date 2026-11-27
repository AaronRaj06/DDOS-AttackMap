import { formatShare, formatUtc, LAYER_LABELS, LAYER_SHORT } from './labels.js';
import { topOrigin } from './severity.js';

// The dashboard in one plain sentence, readable from across a room. It says only what the status tiles and
// the timeline already know. The spike status is the worst across both layers, so a calm status never
// claims "both layers": one of them may simply have no data yet.
export function bulletin(status, spikes, corridors) {
  if (!status) return null;
  if (status.mode === 'demo') return 'Demo data: the routes are illustrative, so there is no spike status to report.';
  if (status.mode === 'unavailable') return 'Cloudflare Radar data is unavailable right now, so there is no spike status to report.';

  const parts = [];
  if (spikes.active.length) {
    for (const spike of spikes.active) {
      const size = spike.ratio ? `about ${spike.ratio}x its typical level` : 'far above its typical level';
      parts.push(`${LAYER_LABELS[spike.layer]}: spike since ${formatUtc(spike.start)}, ${size}.`);
    }
  } else if (spikes.status === 'elevated') {
    parts.push('Traffic is above its usual range, but no spike is confirmed.');
  } else if (spikes.status === 'normal') {
    parts.push('Traffic is within its usual range for the last day.');
  } else {
    parts.push('Spike status needs more Radar history, about six hours of it.');
  }

  const origin = topOrigin(corridors);
  if (origin) parts.push(`Top origin: ${origin.src.name}, ${formatShare(origin.share)} of ${LAYER_SHORT[origin.layer].toLowerCase()}-layer attacks.`);
  return parts.join(' ');
}
