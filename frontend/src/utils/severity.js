// Severity is always an icon and a word as well as a colour
export const SEVERITY = {
  normal: { label: 'Normal', icon: 'check', color: 'var(--sev-normal)', bg: 'var(--sev-normal-bg)' },
  elevated: { label: 'Elevated', icon: 'triangle', color: 'var(--sev-elevated)', bg: 'var(--sev-elevated-bg)' },
  spike: { label: 'Spike', icon: 'burst', color: 'var(--sev-spike)', bg: 'var(--sev-spike-bg)' },
  unavailable: { label: 'No data', icon: 'dash', color: 'var(--sev-unavailable)', bg: 'transparent' },
};

export const SOURCE_STATE = {
  ok: { label: 'OK', tone: 'ok' },
  partial: { label: 'Partly updated', tone: 'warn' },
  stale: { label: 'Out of date', tone: 'warn' },
  error: { label: 'Failing', tone: 'bad' },
  loading: { label: 'Loading', tone: 'warn' },
  not_configured: { label: 'No API key', tone: 'none' },
};

// The biggest origin among the listed routes. Radar's layer 3 list has no targets, so this is layer 7 in practice.
export function topOrigin(corridors) {
  const totals = new Map();
  for (const { src, share, layer } of corridors) {
    const key = `${layer}:${src.code}`;
    totals.set(key, { src, layer, share: (totals.get(key)?.share ?? 0) + share });
  }
  return [...totals.values()].sort((a, b) => b.share - a.share)[0] ?? null;
}
