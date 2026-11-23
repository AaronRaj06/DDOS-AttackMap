import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_FILTERS, parseUrlState, toSearch } from '../utils/filters';
import { readStored, writeStored } from '../utils/storage';

const KEY = 'dosmap.filters';

// A link wins over what was saved, per setting. Saved filters are only overwritten once the person
// changes something, so opening a shared link never clobbers their own watchlist.
function initialState() {
  const { search } = window.location;
  const params = new URLSearchParams(search);
  const url = parseUrlState(search);
  const saved = readStored(KEY, DEFAULT_FILTERS) ?? DEFAULT_FILTERS;
  const stored = parseUrlState(toSearch({
    layer: typeof saved.layer === 'string' ? saved.layer : 'all',
    flagged: saved.flagged === true,
    countries: Array.isArray(saved.countries) ? saved.countries.filter((c) => typeof c === 'string') : [],
  })).filters;
  return {
    filters: {
      layer: params.has('layer') ? url.filters.layer : stored.layer,
      flagged: params.has('flagged') ? url.filters.flagged : stored.flagged,
      countries: params.has('country') ? url.filters.countries : stored.countries,
    },
    kiosk: url.kiosk,
  };
}

export function useFilters() {
  const [state, setState] = useState(initialState);
  const { filters, kiosk } = state;

  const setFilters = useCallback((next) => {
    writeStored(KEY, next);
    setState((s) => ({ ...s, filters: next }));
  }, []);
  const setKiosk = useCallback((on) => setState((s) => ({ ...s, kiosk: on })), []);

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const wanted = toSearch(filters, kiosk);
    if (wanted !== search) window.history.replaceState(window.history.state, '', `${pathname}${wanted}${hash}`);
  }, [filters, kiosk]);

  return { filters, setFilters, kiosk, setKiosk };
}
