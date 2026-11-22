const DAY = 24 * 3600_000;

// Rolling in-memory history, so a spike has a baseline even though each Radar call returns only a window.
export class SeriesStore {
  constructor(retainMs = 3 * DAY) {
    this.retainMs = retainMs;
    this.layers = { l3: new Map(), l7: new Map() };
  }

  add(layer, points) {
    const map = this.layers[layer];
    for (const { t, v } of points) if (Number.isFinite(t) && Number.isFinite(v)) map.set(t, v);
    const cutoff = Math.max(...map.keys()) - this.retainMs;
    for (const t of map.keys()) if (t < cutoff) map.delete(t);
  }

  points(layer) {
    return [...this.layers[layer]].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
  }
}
