import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadAuthConfig } from './modules/auth/auth.config.js';
import { GoogleProvider } from './modules/auth/google.provider.js';
import { AuthService } from './modules/auth/auth.service.js';
import { JobsService } from './modules/scanning/jobs.service.js';
import { BrowserRunner } from './modules/scanning/browser.runner.js';
import { PageSpeedService } from './modules/scanning/pagespeed.service.js';
import { ArtifactStore } from './modules/scanning/artifacts.js';

const env = loadEnvironment();
const authConfig = loadAuthConfig(process.env);
const db = new PrismaClient({ datasources: { db: { url: env.databaseUrl } } });
const auth = new AuthService(authConfig, db, new GoogleProvider(authConfig));
// Ekran görüntüleri JSON'a gömülmez; dosya deposunda saklanır.
const artifactDir =
  env.artifactDir ||
  resolve(fileURLToPath(new URL('../.data/artifacts', import.meta.url)));
const artifactStore = new ArtifactStore(db, artifactDir, {
  maxBytes: env.artifactMaxBytes,
  maxPerScan: env.artifactMaxPerScan,
  retentionDays: env.artifactRetentionDays,
});
// Public URL scans remain disabled until deployment isolation is independently verified.
const jobs = new JobsService(
  db,
  new BrowserRunner(),
  { enabled: env.scanningEnabled },
  new PageSpeedService({
    apiKey: env.pageSpeedApiKey || undefined,
    enabled: env.pageSpeedEnabled,
  }),
  artifactStore,
);
await jobs.start();
const server = createApp(auth, jobs, artifactStore).listen(
  env.port,
  env.host,
  () => {
    console.info(`Nabız API listening on ${env.host}:${env.port}`);
  },
);
server.on('error', () => {
  console.error('API failed to start. Check host and port configuration.');
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await jobs.stop();
    await db.$disconnect();
    process.exitCode = 0;
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
