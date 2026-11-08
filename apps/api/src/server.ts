import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';

const env = loadEnvironment();
const server = createApp().listen(env.port, env.host, () => {
  console.info(`Nabız API listening on ${env.host}:${env.port}`);
});
server.on('error', () => {
  console.error('API failed to start. Check host and port configuration.');
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    process.exitCode = 0;
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
