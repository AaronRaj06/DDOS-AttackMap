import { isIP } from 'node:net';
import express from 'express';
import { createObjectCsvStringifier } from 'csv-writer';

import { isPublicIP, networkOf } from '../services/ip.js';

const MAX_LIMIT = 1000;
const NETWORK = /^(?:(\d{1,3}\.\d{1,3}\.\d{1,3})\.0\/24|([0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4})::\/48)$/;
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

// Only the canonical form networkOf() prints is accepted: 203.0.113.0/24 or 2001:db8:1::/48
export function parseNetwork(raw) {
  const match = typeof raw === 'string' && raw.length <= 40 ? NETWORK.exec(raw) : null;
  if (!match) return null;
  try {
    return networkOf(match[1] ? `${match[1]}.0` : `${match[2]}::`) === raw ? raw : null;
  } catch {
    return null;
  }
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

  // The slash may arrive encoded (%2F) or as a real path separator
  router.get(['/threats/:network', '/threats/:address/:prefix'], (req, res) => {
    const { network: whole, address, prefix } = req.params;
    const network = parseNetwork(whole ?? `${address}/${prefix}`);
    if (!network) {
      return res.status(400).json({ success: false, error: 'network must look like 203.0.113.0/24 or 2001:db8:1::/48' });
    }
    const found = intelligence.explainNetwork(network);
    if (!found) return res.status(404).json({ success: false, error: 'That network is not in the current blacklist' });
    return res.json({ success: true, ...found });
  });

  router.get('/export', withLimit, (req, res) => {
    const csv = createObjectCsvStringifier({
      header: Object.entries(COLUMNS).map(([id, title]) => ({ id, title })),
    });
    res.type('text/csv').attachment(`dos_events_${Date.now()}.csv`);
    res.send(csv.getHeaderString() + csv.stringifyRecords(store.getRecentEvents(res.locals.limit)));
  });

  router.get('/lookup', (req, res) => {
    const { ip } = req.query;
    if (typeof ip !== 'string' || ip.length > 45 || ip.includes('%') || !isIP(ip)) {
      return res.status(400).json({ success: false, error: 'ip must be a valid IPv4 or IPv6 address' });
    }
    if (!isPublicIP(ip)) {
      return res.status(400).json({ success: false, error: 'That is a private, reserved or loopback address. Only public IPs can be looked up.' });
    }
    return res.json({ success: true, ...intelligence.lookup(ip) });
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
