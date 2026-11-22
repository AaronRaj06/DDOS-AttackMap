import { findCountry } from '../services/countries.js';

// Only what is known for every blacklist entry without spending a /check call.
// Report categories are the label, so they must never become features.
const HOSTING = /host|cloud|server|data ?cent|vps|colo|digitalocean|amazon|google|microsoft|ovh|hetzner|linode|vultr/i;
const ACCESS_ISP = /telecom|telekom|mobile|broadband|cable|wireless|communications|fib(er|re)/i;
const NUMERIC = ['ipv6', 'hosting', 'access_isp', 'log_age_hours', 'asn_missing'];

const LABELS = {
  ipv6: 'IPv6 address',
  hosting: 'Network name suggests hosting or cloud',
  access_isp: 'Network name suggests a consumer ISP',
  log_age_hours: 'Time since the last report',
  asn_missing: 'No network (ASN) data for this address',
};

export function featureLabel(name) {
  if (LABELS[name]) return LABELS[name];
  if (name.startsWith('country_')) return `Located in ${findCountry(name.slice(8))?.name ?? name.slice(8)}`;
  if (name.startsWith('asn_')) return `Network AS${name.slice(4)}`;
  return name;
}

export function toRow({ ip, reportedAt }, place, generatedAt) {
  const age = (Date.parse(generatedAt) - Date.parse(reportedAt)) / 3_600_000;
  return { ip, country: place.country, asn: place.asn, org: place.org, ageHours: age > 0 ? age : 0 };
}

function mostCommon(values, limit) {
  const counts = new Map();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
}

export function buildVocabulary(rows) {
  return {
    countries: mostCommon(rows.map((row) => row.country), 30),
    asns: mostCommon(rows.map((row) => row.asn), 50),
  };
}

export function featureNames({ countries, asns }) {
  return [...NUMERIC, ...countries.map((c) => `country_${c}`), ...asns.map((a) => `asn_${a}`)];
}

export function featurize(row, { countries, asns }) {
  return [
    Number(row.ip.includes(':')),
    Number(HOSTING.test(row.org)),
    Number(ACCESS_ISP.test(row.org)),
    Math.log1p(row.ageHours),
    Number(row.asn == null),
    ...countries.map((c) => Number(row.country === c)),
    ...asns.map((a) => Number(row.asn === a)),
  ];
}
