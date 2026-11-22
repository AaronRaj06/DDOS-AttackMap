import { readFileSync } from 'node:fs';

// Label points from Natural Earth (public domain)
const table = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));

export function findCountry(code) {
  if (!Object.hasOwn(table, code ?? '')) return null;
  const [name, lat, lon] = table[code];
  return { code, name, lat, lon };
}
