export const RECENT_LIMIT = 50;

export const initialFeed = {
  status: null,
  vectors: [],
  corridors: [],
  threats: { total: 0, flagged: 0, points: [] },
  events: [],
  received: 0,
};

export function feedReducer(feed, { type, data }) {
  switch (type) {
    case 'snapshot':
    case 'state':
      return { ...feed, ...data };
    case 'event':
      // `received` is separate, because the visible list is capped
      return { ...feed, received: feed.received + 1, events: [...feed.events, data].slice(-RECENT_LIMIT) };
    default:
      return feed;
  }
}
