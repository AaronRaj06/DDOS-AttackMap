import { useEffect, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { readStored, writeStored } from '../utils/storage';
import Icon from './Icon';

const TEXT = {
  demo: ['Demo data: routes are illustrative, not real attacks.', 'Add a Cloudflare API token to show real trends.'],
  unavailable: ['No Radar data yet.', 'Waiting for Cloudflare Radar, or the token is wrong. See Data sources.'],
  live: ['Replayed from Cloudflare Radar.', 'Each arc samples a country-level trend from the last 24 hours. It is not a single live attack.'],
};

// One line, dismissible, and the dismissal is remembered. The mode badge in the header stays either way.
// Until the server says which mode it is in, the slot is held open for the mode seen last time, so the
// page does not jump down when the first message arrives.
export default function Notice({ mode }) {
  const [dismissed, setDismissed] = usePersistentState('dosmap.notice-dismissed', {});
  const [last] = useState(() => readStored('dosmap.last-mode', 'demo'));
  useEffect(() => { if (mode) writeStored('dosmap.last-mode', mode); }, [mode]);

  const shown = mode ?? last;
  if (!TEXT[shown] || dismissed?.[shown]) return null;
  if (!mode) return <div className="notice placeholder" aria-hidden="true" />;
  const text = TEXT[mode];
  return (
    <div className={`notice mode-${mode}`} role="region" aria-label="Notice">
      <Icon name="info" />
      <span className="notice-text"><strong>{text[0]}</strong> <span className="notice-more">{text[1]}</span></span>
      <button type="button" className="btn quiet icon-only" aria-label="Dismiss this notice" onClick={() => setDismissed((d) => ({ ...d, [mode]: true }))}>
        <Icon name="close" />
      </button>
    </div>
  );
}
