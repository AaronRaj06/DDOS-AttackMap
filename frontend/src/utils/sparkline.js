// Turns timeline points into SVG path data. Null when there is nothing worth drawing.
export function buildSparkline(points, { width = 600, height = 44, pad = 3 } = {}) {
  const usable = points.map(({ t, v }) => ({ t: Date.parse(t), v })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (usable.length < 2) return null;
  const t0 = usable[0].t;
  const t1 = usable.at(-1).t;
  const min = Math.min(...usable.map((p) => p.v));
  const max = Math.max(...usable.map((p) => p.v));
  const x = (time) => pad + ((time - t0) / (t1 - t0 || 1)) * (width - 2 * pad);
  // a flat series sits in the middle instead of dividing by zero
  const y = (value) => (max === min ? height / 2 : height - pad - ((value - min) / (max - min)) * (height - 2 * pad));
  const coords = usable.map((p) => `${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`);
  const line = `M${coords.join('L')}`;
  return { line, area: `${line}L${x(t1).toFixed(1)} ${height}L${x(t0).toFixed(1)} ${height}Z`, x, y, t0, t1, min, max };
}
