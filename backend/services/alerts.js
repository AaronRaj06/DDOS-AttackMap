import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const COOLDOWN_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;
const KEEP = 200;
const LAYER_NAMES = { l3: 'Network layer (L3/4)', l7: 'Application layer (L7)' };

export const spikeKey = (spike) => `${spike.layer}:${spike.start}`;

// Only what the server computed: no addresses, no keys, no URL.
export function formatSpike(spike) {
  const size = spike.ratio ? `about ${spike.ratio}x its recent typical level` : 'far above its recent typical level';
  const since = spike.start.slice(0, 16).replace('T', ' ');
  return `Traffic spike on Cloudflare Radar: ${LAYER_NAMES[spike.layer] ?? spike.layer} attack volume is ${size} `
    + `(z-score ${spike.peakZ}), since ${since} UTC. Country-level data, delayed by up to about 15 minutes.`;
}

// Posts Slack-compatible {text} to one operator-chosen https URL. The URL is a secret, so it is
// never logged, never taken from a request, and redirects are never followed.
export class Notifier {
  constructor({ url, fetch = globalThis.fetch, now = Date.now, file = null, cooldownMs = COOLDOWN_MS, timeoutMs = TIMEOUT_MS, retryDelayMs = 1000, log = console }) {
    Object.assign(this, { url, fetch, now, file, cooldownMs, timeoutMs, retryDelayMs, log });
    this.sent = new Set(); // spikes already announced
    this.lastSentAt = -Infinity;
    this.load();
  }

  // Dedupe and cooldown outlive a restart, or a crash loop would alert on every start.
  load() {
    if (!this.file) return;
    try {
      const state = JSON.parse(readFileSync(this.file, 'utf8'));
      this.sent = new Set(Array.isArray(state.sent) ? state.sent : []);
      if (Number.isFinite(state.lastSentAt)) this.lastSentAt = state.lastSentAt;
    } catch (error) {
      if (error.code !== 'ENOENT') this.log.error('Ignoring an unreadable alert state file');
    }
  }

  async save() {
    if (!this.file) return;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, JSON.stringify({ sent: [...this.sent], lastSentAt: this.lastSentAt }));
      await rename(`${this.file}.tmp`, this.file);
    } catch {
      this.log.error('Could not save the alert state');
    }
  }

  lastSentIso() {
    return Number.isFinite(this.lastSentAt) ? new Date(this.lastSentAt).toISOString() : null;
  }

  // One alert per cooldown. A spike held back by the cooldown is announced afterwards if it is still
  // running, and one that ended during the cooldown never is. Never throws.
  async consider(spikes) {
    if (this.now() - this.lastSentAt < this.cooldownMs) return;
    const next = spikes.find((spike) => !this.sent.has(spikeKey(spike)));
    if (!next || !(await this.send(formatSpike(next)))) return;
    this.sent.add(spikeKey(next));
    if (this.sent.size > KEEP) this.sent.delete(this.sent.values().next().value);
    this.lastSentAt = this.now();
    await this.save();
  }

  async send(text) {
    let reason = 'unknown error';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(this.retryDelayMs);
      try {
        const response = await this.fetch(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        await response.body?.cancel();
        if (response.ok) return true;
        if (response.status >= 300 && response.status < 400) {
          reason = `a redirect (HTTP ${response.status}), which is never followed`;
          break;
        }
        reason = `HTTP ${response.status}`;
        // 4xx will not get better by asking again, except a rate limit
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        // error.message can contain the host, so only the kind of failure is kept
        reason = error.name === 'TimeoutError' ? 'a timeout' : 'a connection failure';
      }
    }
    this.log.error(`Alert webhook failed: ${reason}`);
    return false;
  }
}
