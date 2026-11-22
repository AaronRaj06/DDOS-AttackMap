import { createService } from './app.js';
import { loadConfig } from './config/index.js';

const config = loadConfig();
const service = await createService(config);

service.server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${config.port} is in use. Set PORT in backend/.env.`
    : `Server error: ${error.message}`);
  process.exit(1);
});

service.server.listen(config.port, config.host, async () => {
  await service.start();
  const { mode, geo, classifier } = service.intelligence.status();
  console.log(`DoS map on http://${config.host}:${config.port} (mode=${mode}, geo=${geo}, classifier=${classifier.state})`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(1), 10_000).unref();
  await service.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
