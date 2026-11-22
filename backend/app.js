import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { connectDB } from './config/database.js';
import { loadModel } from './ml/classifier.js';
import { createEventsRouter } from './routes/events.js';
import { EventGenerator } from './services/eventGenerator.js';
import { EventStore } from './services/eventStore.js';
import { Notifier } from './services/alerts.js';
import { openGeoIP } from './services/geoIP.js';
import { Intelligence } from './services/intelligence.js';
import { EventBroadcaster } from './websocket/eventBroadcaster.js';

export async function createService(config, { fetch, log = console, geo: geoOverride, model: modelOverride } = {}) {
  const store = new EventStore();
  const geo = geoOverride ?? await openGeoIP(config.paths.geo, { log });
  const model = modelOverride ?? loadModel(config.paths.model, { log });
  let broadcaster;
  const notifier = config.alertWebhookUrl
    ? new Notifier({ url: config.alertWebhookUrl, file: config.paths.alerts, fetch, log })
    : null;
  const intelligence = new Intelligence({
    config, geo, model, fetch, log, notifier,
    onChange: () => broadcaster.broadcast({ type: 'state', data: intelligence.snapshot() }),
    onSeries: (layer, points) => db.saveSeries?.(layer, points),
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  // upgrade-insecure-requests would break plain-http localhost in Safari
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(['/events', '/stats', '/threats', '/export', '/timeline'], rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests' },
  }));

  // Tighter than the rest: a lookup is the one call that takes an address from the caller
  app.use('/lookup', rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests' },
  }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connectedClients: broadcaster.getClientCount(),
      ...intelligence.status(),
    });
  });
  app.use(createEventsRouter({ store, intelligence }));
  app.get(['/login', '/signup', '/dashboard'], (req, res) => res.redirect('/'));
  app.use(express.static(config.paths.frontend));
  app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) log.error(error);
    return res.status(status).json({ success: false, error: status === 500 ? 'Internal error' : 'Bad request' });
  });

  const server = http.createServer(app);
  broadcaster = new EventBroadcaster(server, {
    allowedOrigins: config.allowedOrigins,
    trustProxy: config.trustProxy,
    log,
    getSnapshot: () => ({ ...intelligence.snapshot(), events: store.getRecentEvents(50) }),
  });

  let db = { save: null, saveSeries: null, close: async () => {} };
  const source = config.cloudflareToken ? 'radar' : 'demo';
  const generator = new EventGenerator({
    source,
    getRoutes: () => intelligence.routes,
    onEvent(event) {
      store.addEvent(event);
      broadcaster.broadcast({ type: 'event', data: event });
      db.save?.(event);
    },
  });

  return {
    server,
    intelligence,
    async start() {
      db = connectDB(config.mongoUri, {
        log,
        async onConnect({ Event, SeriesPoint }) {
          const saved = await Event.find({ source }, { _id: 0 }).sort({ ts: -1 }).limit(store.maxSize).lean();
          store.restore(saved.reverse().map((event) => ({ ...event, ts: event.ts.toISOString() })));
          for (const layer of ['l3', 'l7']) {
            const points = await SeriesPoint.find({ layer }, { _id: 0, t: 1, v: 1 }).sort({ t: -1 }).limit(300).lean();
            intelligence.restoreSeries(layer, points.map(({ t, v }) => ({ t: t.getTime(), v })));
          }
        },
      });
      await intelligence.start();
      generator.start();
    },
    async stop() {
      generator.stop();
      intelligence.stop();
      broadcaster.close();
      if (server.listening) {
        const closed = new Promise((resolve) => server.close(resolve));
        server.closeAllConnections();
        await closed;
      }
      await db.close();
    },
  };
}
