import countries from '../data/countries.js';

export const LAYER_KEYS = ['l3', 'l7'];
export const MAX_WATCHED = 20;
export const DEFAULT_FILTERS = Object.freeze({ layer: 'all', flagged: false, countries: [] });

export const countryName = (code) => countries[code] ?? code;
export const isCountry = (code) => Object.hasOwn(countries, code);
export const allCountries = () => Object.entries(countries).map(([code, name]) => ({ code, name }));

// Whitelist parser: only values that map to a known layer or a known country code survive, and
// nothing from the URL is ever shown except through the country table.
export function parseUrlState(search) {
  const params = new URLSearchParams(search);
  const layer = params.get('layer');
  const watched = [];
  for (const raw of (params.get('country') ?? '').split(',')) {
    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && isCountry(code) && !watched.includes(code) && watched.length < MAX_WATCHED) watched.push(code);
  }
  return {
    filters: { layer: LAYER_KEYS.includes(layer) ? layer : 'all', flagged: params.get('flagged') === '1', countries: watched },
    hasCountries: watched.length > 0,
    kiosk: params.get('kiosk') === '1',
  };
}

export function toSearch(filters, kiosk = false) {
  const params = new URLSearchParams();
  if (filters.layer !== 'all') params.set('layer', filters.layer);
  if (filters.countries.length) params.set('country', filters.countries.join(','));
  if (filters.flagged) params.set('flagged', '1');
  if (kiosk) params.set('kiosk', '1');
  const text = params.toString().replaceAll('%2C', ',');
  return text ? `?${text}` : '';
}

export const hasActiveFilters = (f) => f.layer !== 'all' || f.flagged || f.countries.length > 0;

const layerOk = (f, layer) => f.layer === 'all' || f.layer === layer;
const countryOk = (f, ...codes) => f.countries.length === 0 || codes.some((code) => f.countries.includes(code));

// A route or event passes when its layer matches and the watchlist holds either end
export const matchesEvent = (f, event) => layerOk(f, event.layer) && countryOk(f, event.src_country, event.dst_country);
export const matchesRoute = (f, route) => layerOk(f, route.layer) && countryOk(f, route.src.code, route.dst.code);
export const matchesTarget = (f, row) => layerOk(f, row.layer) && countryOk(f, row.country.code);
// Abusive-IP points have no layer, so the layer filter leaves them alone
export const matchesPoint = (f, point) => (!f.flagged || point.flagged) && countryOk(f, point.country);
