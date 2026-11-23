import { formatAge } from '../utils/age';
import { formatShare, LAYER_SHORT, spikeSentence } from '../utils/labels';
import { SEVERITY, topOrigin } from '../utils/severity';
import Icon from './Icon';

function threatDetail(status, spikes) {
  if (status.mode === 'demo') return 'Needs a Cloudflare Radar token';
  const first = spikes.active[0];
  if (spikes.status === 'spike' && first) return spikeSentence(first);
  if (spikes.status === 'elevated') return 'The latest reading is above the usual range';
  if (spikes.status === 'normal') return 'Within the usual range for the last day';
  return 'Waiting for enough Radar history';
}

export default function StatusTiles({ status, spikes, corridors, now }) {
  const sev = SEVERITY[status ? spikes.status : 'unavailable'];
  const origin = topOrigin(corridors);
  const live = status?.mode === 'live';
  return (
    <dl className="tiles">
      <div className="tile" style={{ '--tone': sev.color, '--tone-bg': sev.bg }}>
        <dt>Threat status</dt>
        <dd className="tile-value severity"><Icon name={sev.icon} />{sev.label}</dd>
        <dd className="tile-note">{status ? threatDetail(status, spikes) : 'Connecting'}</dd>
      </div>
      <div className="tile">
        <dt>Top origin</dt>
        <dd className="tile-value">{origin ? origin.src.name : '–'}</dd>
        <dd className="tile-note">
          {origin ? `${live ? `${formatShare(origin.share)} of ` : 'Demo: '}${LAYER_SHORT[origin.layer].toLowerCase()}-layer attacks` : 'No origin data yet'}
        </dd>
      </div>
      <div className="tile">
        <dt>Data freshness</dt>
        <dd className="tile-value">{status?.radar.updatedAt ? formatAge(status.radar.updatedAt, now) : status?.mode === 'demo' ? 'Demo data' : '–'}</dd>
        <dd className="tile-note">
          {status?.abuse.updatedAt ? `AbuseIPDB list from ${formatAge(status.abuse.updatedAt, now)}` : 'AbuseIPDB list not loaded'}
        </dd>
      </div>
    </dl>
  );
}
