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
  const height = 0.03 + 0.13 * angle;

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
