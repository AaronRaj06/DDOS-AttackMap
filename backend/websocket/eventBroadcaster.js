import { WebSocket, WebSocketServer } from 'ws';
import { clientIP } from '../services/ip.js';

const MAX_CLIENTS = 500;
const MAX_PER_IP = 20;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_MS = 30_000;

export function isAllowedOrigin({ origin, host }, allowed) {
  if (!origin) return true; // non-browser clients send none
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class EventBroadcaster {
  constructor(server, { getSnapshot, allowedOrigins = [], trustProxy = 0, log = console }) {
    this.perIP = new Map();
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: 1024,
      verifyClient: ({ req }, done) => {
        if (!isAllowedOrigin(req.headers, allowedOrigins)) return done(false, 403);
        if (this.wss.clients.size >= MAX_CLIENTS) return done(false, 503);
        if ((this.perIP.get(clientIP(req, trustProxy)) ?? 0) >= MAX_PER_IP) return done(false, 429);
        return done(true);
      },
    });
    // ws re-emits HTTP server errors, which index.js handles
    this.wss.on('error', () => {});

    this.wss.on('connection', (socket, req) => {
      const ip = clientIP(req, trustProxy);
      this.perIP.set(ip, (this.perIP.get(ip) ?? 0) + 1);
      socket.isAlive = true;
      socket.on('pong', () => { socket.isAlive = true; });
      socket.on('error', (error) => log.error(`WebSocket client error: ${error.code ?? error.name}`));
      socket.on('close', () => {
        const left = this.perIP.get(ip) - 1;
        if (left > 0) this.perIP.set(ip, left);
        else this.perIP.delete(ip);
      });
      socket.send(JSON.stringify({ type: 'snapshot', data: getSnapshot() }));
    });

    this.heartbeat = setInterval(() => {
      for (const socket of this.wss.clients) {
        if (!socket.isAlive) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const socket of this.wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      // A client that stops reading would otherwise grow our memory without limit
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) socket.terminate();
      else socket.send(payload);
    }
  }

  getClientCount() {
    return this.wss.clients.size;
  }

  close() {
    clearInterval(this.heartbeat);
    for (const socket of this.wss.clients) socket.terminate();
    this.wss.close();
  }
}
