import { loadConfig } from '../config/index.js';
import { Notifier } from '../services/alerts.js';

let url;
try {
  ({ alertWebhookUrl: url } = loadConfig());
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (!url) {
  console.error('Set ALERT_WEBHOOK_URL in backend/.env first.');
  process.exit(1);
}

const ok = await new Notifier({ url }).send('Test alert from the Global DoS Attack Map. If you can read this, alerts work. No spike was detected.');
console.log(ok ? 'Sent. Check the channel.' : 'Failed, see the reason above. The URL is never printed.');
process.exit(ok ? 0 : 1);
