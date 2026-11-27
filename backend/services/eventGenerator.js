import { randomUUID } from 'node:crypto';

export function pickWeighted(items, random = Math.random) {
  let left = random() * items.reduce((sum, item) => sum + item.share, 0);
  for (const item of items) {
    left -= item.share;
    if (left < 0) return item;
  }
  return items.at(-1);
}

// Shares are percentages within a layer, so choose the layer first, then the route.
export function generateEvent(routes, source, random = Math.random) {
  if (!routes.length) return null;
  const layers = [...new Set(routes.map((route) => route.layer))];
  const layer = layers[Math.floor(random() * layers.length)];
  const { src, dst, share } = pickWeighted(routes.filter((route) => route.layer === layer), random);
  return {
    id: randomUUID(),
    ts: new Date().toISOString(),
    source,
    layer,
    share,
    src_country: src.code,
    src_name: src.name,
    src_lat: src.lat,
    src_lon: src.lon,
    dst_country: dst.code,
    dst_name: dst.name,
    dst_lat: dst.lat,
    dst_lon: dst.lon,
  };
}

export class EventGenerator {
  constructor({ getRoutes, source, onEvent }) {
    Object.assign(this, { getRoutes, source, onEvent });
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    const tick = () => {
      this.timer = setTimeout(tick, 700 + Math.random() * 500);
      const event = generateEvent(this.getRoutes(), this.source);
      if (event) this.onEvent(event);
    };
    this.timer = setTimeout(tick, 0);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
