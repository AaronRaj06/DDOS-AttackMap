import { useEffect, useState } from 'react';

// GET a JSON endpoint. `url` null means "not asked yet". `refresh` re-fetches when it changes.
export function useRemote(url, refresh = 0) {
  const [state, setState] = useState({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        setState({ url, data: body, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ url, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [url, refresh]);
  // Results for an old URL are not shown for a new one
  const current = state.url === url;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: Boolean(url) && !(current && (state.data || state.error)) };
}
