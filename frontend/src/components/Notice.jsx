import { usePersistentState } from '../hooks/usePersistentState';
import Icon from './Icon';

const TEXT = {
  demo: ['Demo data: routes are illustrative, not real attacks.', 'Add a Cloudflare API token to show real trends.'],
  unavailable: ['No Radar data yet.', 'Waiting for Cloudflare Radar, or the token is wrong. See Data sources.'],
  live: ['Replayed from Cloudflare Radar.', 'Each arc samples a country-level trend from the last 24 hours. It is not a single live attack.'],
};

// One line, dismissible, and the dismissal is remembered. The mode badge in the header stays either way.
export default function Notice({ mode }) {
  const [dismissed, setDismissed] = usePersistentState('dosmap.notice-dismissed', {});
  const text = TEXT[mode];
  if (!text || dismissed?.[mode]) return null;
  return (
    <p className={`notice mode-${mode}`}>
      <Icon name="info" />
      <span className="notice-text"><strong>{text[0]}</strong> <span className="notice-more">{text[1]}</span></span>
      <button type="button" className="btn quiet icon-only" aria-label="Dismiss this notice" onClick={() => setDismissed((d) => ({ ...d, [mode]: true }))}>
        <Icon name="close" />
      </button>
    </p>
  );
}
