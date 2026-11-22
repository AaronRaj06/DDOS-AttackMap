import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { isPublicIP } from '../services/ip.js';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

function integer(env, name, fallback, min, max) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

// Error messages never repeat the value: webhook URLs are secrets.
// shortcut: a hostname that resolves to a private address is not caught, only literals are.
// Fine while the URL comes from the operator's own environment.
function webhookUrl(raw) {
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('ALERT_WEBHOOK_URL is not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('ALERT_WEBHOOK_URL must use https');
  if (url.username || url.password) throw new Error('ALERT_WEBHOOK_URL must not contain a username or password');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && !isPublicIP(host))) {
    throw new Error('ALERT_WEBHOOK_URL must point at a public host');
  }
  return url.href;
}

export function loadConfig(env = process.env) {
  return {
    port: integer(env, 'PORT', 5050, 0, 65535),
    host: env.HOST?.trim() || '127.0.0.1',
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0, 10),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    cloudflareToken: env.CLOUDFLARE_API_TOKEN?.trim() ?? '',
    abuseKey: env.ABUSEIPDB_KEY?.trim() ?? '',
    mongoUri: env.MONGODB_URI?.trim() ?? '',
    alertWebhookUrl: webhookUrl(env.ALERT_WEBHOOK_URL?.trim()),
    paths: {
      blacklist: path('../.cache/blacklist.json'),
      alerts: path('../.cache/alerts.json'),
      geo: path('../data/geo/'),
      model: path('../ml/model.json'),
      training: path('../data/training/labels.jsonl'),
      frontend: path('../../frontend/dist/'),
    },
  };
}
