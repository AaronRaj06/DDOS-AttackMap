export class UpstreamError extends Error {
  constructor(message, { status, retryAfterMs } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Messages reach clients through /health, so they never carry URLs, headers or bodies.
export async function fetchJson(url, { headers, fetch = globalThis.fetch, service }) {
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), redirect: 'error' });
  } catch {
    throw new UpstreamError(`${service} could not be reached`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    const seconds = Number(response.headers.get('retry-after'));
    // Cloudflare answers 400, not 401, for a malformed token
    const hint = [400, 401, 403].includes(response.status) ? '. Check the API key' : '';
    throw new UpstreamError(`${service} returned HTTP ${response.status}${hint}`, {
      status: response.status,
      retryAfterMs: seconds > 0 ? seconds * 1000 : undefined,
    });
  }
  try {
    return { body: await response.json(), headers: response.headers };
  } catch {
    throw new UpstreamError(`${service} returned invalid JSON`, { status: response.status });
  }
}
