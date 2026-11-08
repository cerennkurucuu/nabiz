import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { PrismaClient } from '@prisma/client';
import { loadAuthConfig } from './modules/auth/auth.config.js';
import { GoogleProvider } from './modules/auth/google.provider.js';
import { AuthService } from './modules/auth/auth.service.js';

const env = loadEnvironment();
const authConfig = loadAuthConfig(process.env);
const db = new PrismaClient({ datasources: { db: { url: env.databaseUrl } } });
const auth = new AuthService(authConfig, db, new GoogleProvider(authConfig));
const server = createApp(auth).listen(env.port, env.host, () => {
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
  server.close(async () => {
    await db.$disconnect();
    process.exitCode = 0;
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
