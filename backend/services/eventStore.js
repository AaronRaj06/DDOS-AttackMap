function countBy(events, key) {
  const counts = new Map();
  for (const event of events) counts.set(event[key], (counts.get(event[key]) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
}

// Circular in-memory buffer of recent events
export class EventStore {
  constructor(maxSize = 1000) {
    this.events = [];
    this.maxSize = maxSize;
  }

  addEvent(event) {
    this.events.push(event);
    if (this.events.length > this.maxSize) this.events.shift();
  }

  restore(older) {
    const ids = new Set(this.events.map((event) => event.id));
    this.events = [...older.filter((event) => !ids.has(event.id)), ...this.events].slice(-this.maxSize);
  }

  getRecentEvents(limit = 100) {
    return this.events.slice(-limit);
  }

  getStats() {
    return {
      total: this.events.length,
      topSourceCountries: countBy(this.events, 'src_country'),
      topTargetCountries: countBy(this.events, 'dst_country'),
      byLayer: countBy(this.events, 'layer'),
    };
  }
}
