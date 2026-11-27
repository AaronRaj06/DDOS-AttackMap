const RAD = Math.PI / 180;

export function toXYZ(lat, lon, radius = 1) {
  const flat = Math.cos(lat * RAD) * radius;
  return [flat * Math.cos(lon * RAD), Math.sin(lat * RAD) * radius, -flat * Math.sin(lon * RAD)];
}

// Great-circle path lifted off the surface. Null when both ends are the same place.
export function arcPoints(from, to, steps = 64) {
  const a = toXYZ(...from);
  const b = toXYZ(...to);
  const cos = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(cos);
  if (angle < 1e-3) return null;

  let side = b.map((value, i) => value - cos * a[i]);
  let length = Math.hypot(...side);
  if (length < 1e-6) {
    // Antipodes share infinitely many great circles: take any
    side = Math.abs(a[1]) < 0.9 ? [-a[2], 0, a[0]] : [0, a[2], -a[1]];
    length = Math.hypot(...side);
  }
  const unit = side.map((value) => value / length);
  // capped so the highest arc stays inside the radius the camera fits (1.22), and never leaves the frame
  const height = Math.min(0.2, 0.03 + 0.13 * angle);

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const radius = 1.006 + height * Math.sin(Math.PI * t);
    return a.map((value, j) => (value * Math.cos(angle * t) + unit[j] * Math.sin(angle * t)) * radius);
  });
}

// Flat vertex pairs for a single LineSegments draw call.
export function landSegments({ features }, radius = 1) {
  const out = [];
  for (const { geometry } of features) {
    let polygons = [];
    if (geometry?.type === 'Polygon') polygons = [geometry.coordinates];
    else if (geometry?.type === 'MultiPolygon') polygons = geometry.coordinates;

    for (const ring of polygons.flat()) {
      for (let i = 1; i < ring.length; i++) {
        const [lon1, lat1] = ring[i - 1];
        const [lon2, lat2] = ring[i];
        // The flat map closes polygons along the date line and south pole; those are not coasts
        if (Math.abs(lon1) >= 179.99 && Math.abs(lon2) >= 179.99) continue;
        if (lat1 <= -89.99 || lat2 <= -89.99) continue;
        const steps = Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / 3);
        for (let s = 0; s < steps; s++) {
          const at = (t) => toXYZ(lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t, radius);
          out.push(...at(s / steps), ...at((s + 1) / steps));
        }
      }
    }
  }
  return out;
}

// Equirectangular map, 360 x 180 units: x is longitude + 180, y is 90 - latitude
export const projectXY = (lat, lon) => [lon + 180, 90 - lat];

function* ringSegments(geometry) {
  let polygons = [];
  if (geometry?.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry?.type === 'MultiPolygon') polygons = geometry.coordinates;
  for (const ring of polygons.flat()) for (let i = 1; i < ring.length; i++) yield [ring[i - 1], ring[i]];
}

// Land outline as one SVG path. The date-line and south-pole edges that close polygons are left out.
export function landPath({ features }) {
  const parts = [];
  let pen = null;
  for (const { geometry } of features) {
    for (const [[lon1, lat1], [lon2, lat2]] of ringSegments(geometry)) {
      const skip = (Math.abs(lon1) >= 179.99 && Math.abs(lon2) >= 179.99) || lat1 <= -89.99 || lat2 <= -89.99;
      if (skip) {
        pen = null;
        continue;
      }
      const [x1, y1] = projectXY(lat1, lon1);
      const [x2, y2] = projectXY(lat2, lon2);
      if (pen !== `${x1},${y1}`) parts.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}`);
      parts.push(`L${x2.toFixed(1)} ${y2.toFixed(1)}`);
      pen = `${x2},${y2}`;
    }
    pen = null;
  }
  return parts.join('');
}

// A curve between two places, bowed upward. shortcut: a route across the date line is drawn the
// short way and leaves the map edge without re-entering. Upgrade to split paths if that matters.
export function arc2d(from, to) {
  const [x1, y1] = projectXY(...from);
  let [x2, y2] = projectXY(...to);
  if (x2 - x1 > 180) x2 -= 360;
  if (x1 - x2 > 180) x2 += 360;
  const lift = Math.min(40, Math.hypot(x2 - x1, y2 - y1) * 0.35);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${((x1 + x2) / 2).toFixed(1)} ${(((y1 + y2) / 2) - lift).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
