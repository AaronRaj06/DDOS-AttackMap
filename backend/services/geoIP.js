import { access } from 'node:fs/promises';
import { join } from 'node:path';
import * as maxmind from 'maxmind';
import { findCountry } from './countries.js';

async function open(file, log) {
  try {
    await access(file);
  } catch {
    return null;
  }
  try {
    return await maxmind.open(file);
  } catch (error) {
    log.error(`Cannot read ${file}: ${error.message}`);
    return null;
  }
}

// Offline lookups with DB-IP Lite. Without it, IPs fall back to their country's label point.
export async function openGeoIP(dir, { log = console } = {}) {
  const [city, asn] = await Promise.all([
    open(join(dir, 'city.mmdb'), log),
    open(join(dir, 'asn.mmdb'), log),
  ]);

  return {
    hasCity: Boolean(city),
    hasASN: Boolean(asn),
    locate(ip, countryCode) {
      const place = city?.get(ip);
      const network = asn?.get(ip);
      const country = countryCode ?? place?.country?.iso_code ?? null;
      const { latitude, longitude } = place?.location ?? {};
      // DB-IP stores 0,0 for addresses it cannot place
      const precise = Number.isFinite(latitude) && Number.isFinite(longitude) && Boolean(latitude || longitude);
      const fallback = findCountry(country);
      return {
        country,
        lat: precise ? latitude : fallback?.lat ?? null,
        lon: precise ? longitude : fallback?.lon ?? null,
        precise,
        city: place?.city?.names?.en ?? null,
        asn: network?.autonomous_system_number ?? null,
        org: network?.autonomous_system_organization ?? '',
      };
    },
  };
}
