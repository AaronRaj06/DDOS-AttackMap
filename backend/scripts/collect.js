import { loadConfig } from '../config/index.js';
import { collect } from '../ml/dataset.js';
import { AbuseIPDBClient } from '../services/abuseIPDB.js';
import { openGeoIP } from '../services/geoIP.js';
import { refreshBlacklist } from '../services/threatFeed.js';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const { abuseKey, paths } = loadConfig();
if (!abuseKey) fail('Set ABUSEIPDB_KEY in backend/.env first.');
const geo = await openGeoIP(paths.geo);
if (!geo.hasASN) fail('Run `npm run geo:update` first: the model needs ASN data.');

const client = new AbuseIPDBClient(abuseKey);
const { cache } = await refreshBlacklist({ client, file: paths.blacklist });
if (!cache.entries.length) fail(cache.error ?? 'The blacklist is empty. Try again later.');

console.log('Labeling up to 950 IPs, which takes a few minutes and most of the daily /check quota.');
const { added, total } = await collect({ client, geo, blacklist: cache, file: paths.training });
console.log(`Added ${added}. The dataset has ${total} labeled IPs.`);
if (!added) process.exit(1);
