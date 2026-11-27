import { LAYER_LABELS } from '../utils/labels';

export function Mark({ shape, color }) {
  return (
    <svg className="mark" viewBox="0 0 12 12" aria-hidden="true">
      {shape === 'ring'
        ? <circle cx="6" cy="6" r="4.2" fill="none" stroke={color} strokeWidth="2" />
        : <circle cx="6" cy="6" r="4.5" fill={color} />}
    </svg>
  );
}

// Under the map, never on top of it. Flagged points are rings, so the shape says it as well as the colour.
export default function Legend({ hasPoints, hasFlagged }) {
  return (
    <ul className="legend" aria-label="Legend">
      <li><Mark shape="disc" color="var(--data-l3)" />{LAYER_LABELS.l3}</li>
      <li><Mark shape="disc" color="var(--data-l7)" />{LAYER_LABELS.l7}</li>
      {hasPoints && <li><Mark shape="disc" color="var(--data-reported)" />Reported abusive IP</li>}
      {hasFlagged && <li><Mark shape="ring" color="var(--data-flagged)" />Likely DoS source</li>}
    </ul>
  );
}
