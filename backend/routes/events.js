import express from 'express';
import { createObjectCsvStringifier } from 'csv-writer';

const MAX_LIMIT = 1000;
const COLUMNS = {
  id: 'Event ID',
  ts: 'Replayed At',
  source: 'Source',
  layer: 'Layer',
  share: 'Share Within Layer (%)',
  src_country: 'Origin Country',
  src_name: 'Origin Name',
  src_lat: 'Origin Latitude',
  src_lon: 'Origin Longitude',
  dst_country: 'Target Country',
  dst_name: 'Target Name',
  dst_lat: 'Target Latitude',
  dst_lon: 'Target Longitude',
};

export function parseLimit(raw) {
  if (raw === undefined) return 100;
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= MAX_LIMIT ? value : null;
}

function withLimit(req, res, next) {
  res.locals.limit = parseLimit(req.query.limit);
  if (res.locals.limit !== null) return next();
  return res.status(400).json({ success: false, error: `limit must be an integer from 1 to ${MAX_LIMIT}` });
}

export function createEventsRouter({ store, intelligence }) {
  const router = express.Router();

  router.get('/events', withLimit, (req, res) => {
    const events = store.getRecentEvents(res.locals.limit);
    res.json({ success: true, count: events.length, events });
  });

  router.get('/stats', (req, res) => {
    res.json({ success: true, events: store.getStats(), status: intelligence.status() });
  });

  router.get('/threats', withLimit, (req, res) => {
    const { total, flagged, points } = intelligence.threats;
    res.json({ success: true, total, flagged, threats: points.slice(0, res.locals.limit) });
  });

  router.get('/export', withLimit, (req, res) => {
    const csv = createObjectCsvStringifier({
      header: Object.entries(COLUMNS).map(([id, title]) => ({ id, title })),
    });
    res.type('text/csv').attachment(`dos_events_${Date.now()}.csv`);
    res.send(csv.getHeaderString() + csv.stringifyRecords(store.getRecentEvents(res.locals.limit)));
  });

  router.get('/timeline', withLimit, (req, res) => {
    const { layer } = req.query;
    if (layer !== 'l3' && layer !== 'l7') {
      return res.status(400).json({ success: false, error: 'layer must be l3 or l7' });
    }
    return res.json({ success: true, layer, ...intelligence.timeline(layer, res.locals.limit) });
  });

  return router;
}
