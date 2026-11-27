// Built-in examples for when the server has nothing to give (no connection, or no AbuseIPDB key).
// Always shown with an "illustrative" badge. Generated here, never sent anywhere.

const place = (code, name, lat, lon) => ({ code, name, lat, lon });
const US = place('US', 'United States', 39.8, -98.6);
const DE = place('DE', 'Germany', 51.2, 10.4);
const BR = place('BR', 'Brazil', -14.2, -51.9);
const GB = place('GB', 'United Kingdom', 55.4, -3.4);
const IN = place('IN', 'India', 20.6, 79);
const SG = place('SG', 'Singapore', 1.35, 103.8);
const VN = place('VN', 'Vietnam', 14.1, 108.3);

export const ROUTES = [
  { layer: 'l3', share: 9, src: US, dst: DE },
  { layer: 'l3', share: 8, src: BR, dst: US },
  { layer: 'l3', share: 7, src: VN, dst: SG },
  { layer: 'l7', share: 9, src: US, dst: GB },
  { layer: 'l7', share: 8, src: IN, dst: US },
  { layer: 'l7', share: 7, src: DE, dst: BR },
];

// Seeded, so the same page draws the same dots every time
function random(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Reported networks cluster where hosting does
const HUBS = [[39, -77, 60], [37.4, -122, 40], [50.1, 8.7, 50], [52.4, 4.9, 40], [1.35, 103.8, 40], [31.2, 121.5, 50],
  [-23.5, -46.6, 30], [19, 72.8, 30], [55.7, 37.6, 30], [35.7, 139.7, 30]];

export const POINTS = (() => {
  const next = random(11);
  return HUBS.flatMap(([lat, lon, count]) => Array.from({ length: count }, () => ({
    lat: lat + (next() - 0.5) * 8,
    lon: lon + (next() - 0.5) * 10,
    flagged: false,
  })));
})();

// An arc the replay could draw, picked in proportion to share like the server's replay
export function routeEvent(routes, id) {
  const total = routes.reduce((sum, route) => sum + route.share, 0);
  let pick = Math.random() * total;
  const route = routes.find((r) => (pick -= r.share) < 0) ?? routes[0];
  return {
    id, layer: route.layer, share: route.share,
    src_lat: route.src.lat, src_lon: route.src.lon, dst_lat: route.dst.lat, dst_lon: route.dst.lon,
  };
}

// The arcs most maps show: anywhere to anywhere, belonging to no source
export function inventedEvent(id) {
  const lat = () => -50 + Math.random() * 115;
  const lon = () => -180 + Math.random() * 360;
  return { id, layer: 'invented', color: '--text-3', src_lat: lat(), src_lon: lon(), dst_lat: lat(), dst_lon: lon() };
}

// Five made-up networks for the classifier scene, in documentation address ranges (RFC 5737, RFC 3849) and
// documentation AS numbers (RFC 5398), worded like a real GET /threats/{network} answer. The threshold is
// made up too; a trained model picks its own on validation data.
export const THRESHOLD = 0.5;
const factor = (label, contribution) => ({ label, contribution, direction: contribution >= 0 ? 'raises' : 'lowers' });
export const NETWORKS = [
  { network: '203.0.113.0/24', country: 'NL', lat: 52.37, lon: 4.9, explanation: { bias: -1.2, other: 0.1, factors: [
    factor('Network name suggests hosting or cloud', 1.9), factor('Time since the last report', 0.8), factor('Located in Netherlands', 0.4)] } },
  { network: '198.51.100.0/24', country: 'US', lat: 39.04, lon: -77.49, explanation: { bias: -1.2, other: -0.1, factors: [
    factor('Network name suggests hosting or cloud', 1.5), factor('Network AS64500', 0.6), factor('Time since the last report', -0.3)] } },
  { network: '2001:db8:20::/48', country: 'SG', lat: 1.35, lon: 103.82, explanation: { bias: -1.2, other: 0.2, factors: [
    factor('Network name suggests hosting or cloud', 1.2), factor('Time since the last report', 0.9), factor('Network AS64511', -0.4)] } },
  { network: '2001:db8:10::/48', country: 'DE', lat: 50.11, lon: 8.68, explanation: { bias: -1.2, other: 0, factors: [
    factor('Network name suggests hosting or cloud', 0.9), factor('IPv6 address', 0.7), factor('Time since the last report', -0.6)] } },
  { network: '192.0.2.0/24', country: 'BR', lat: -23.55, lon: -46.63, explanation: { bias: -1.2, other: -0.2, factors: [
    factor('Network name suggests a consumer ISP', -1.4), factor('Time since the last report', -0.5), factor('Located in Brazil', 0.3)] } },
];

// Three days of 15-minute buckets around 1,000 with a little noise, then a 3x surge for two hours: the shape
// the detector is built to find. The spike is described by construction, not detected here.
export const TIMELINE = (() => {
  const next = random(5);
  const step = 15 * 60_000;
  const n = 288;
  const end = Date.UTC(2026, 10, 27, 12);
  const points = Array.from({ length: n }, (_, i) => ({
    t: new Date(end - (n - 1 - i) * step).toISOString(),
    v: Math.round(1000 * (i >= n - 24 && i < n - 16 ? 3 : 1) * (1 + 0.06 * (next() - 0.5))),
  }));
  const spike = { layer: 'l3', start: points[n - 24].t, end: points[n - 17].t, active: false, peakAt: points[n - 20].t, peakZ: 8.1, ratio: 3, baseline: 1000 };
  return { layer: 'l3', status: 'normal', points, spikes: [spike] };
})();
