import { fileURLToPath } from 'node:url';

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

export function loadConfig(env = process.env) {
  return {
    port: integer(env, 'PORT', 5050, 0, 65535),
    host: env.HOST?.trim() || '127.0.0.1',
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0, 10),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    cloudflareToken: env.CLOUDFLARE_API_TOKEN?.trim() ?? '',
    abuseKey: env.ABUSEIPDB_KEY?.trim() ?? '',
    mongoUri: env.MONGODB_URI?.trim() ?? '',
    paths: {
      blacklist: path('../.cache/blacklist.json'),
      geo: path('../data/geo/'),
      model: path('../ml/model.json'),
      training: path('../data/training/labels.jsonl'),
      frontend: path('../../frontend/dist/'),
    },
  };
}
