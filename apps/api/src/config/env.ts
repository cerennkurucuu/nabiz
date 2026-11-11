import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env['PORT'] ?? 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('Invalid NODE_ENV.');
  }
  const host = env['HOST'] ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST cannot be empty.');
  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl?.startsWith('file:') || databaseUrl.length <= 5) {
    throw new Error('DATABASE_URL must be a non-empty SQLite file URL.');
  }
  const scanning = (env['SCANNING_ENABLED'] ?? 'false').trim().toLowerCase();
  if (!['true', 'false', '1', '0'].includes(scanning)) {
    throw new Error('SCANNING_ENABLED must be true or false.');
  }
  const scanningEnabled = scanning === 'true' || scanning === '1';
  const pageSpeedApiKey = env['PAGESPEED_API_KEY']?.trim() ?? '';
  if (pageSpeedApiKey && !/^[A-Za-z0-9_-]{10,120}$/.test(pageSpeedApiKey)) {
    throw new Error('PAGESPEED_API_KEY must be a Google API key.');
  }
  const pageSpeed = (env['PAGESPEED_ENABLED'] ?? 'true').trim().toLowerCase();
  if (!['true', 'false', '1', '0'].includes(pageSpeed)) {
    throw new Error('PAGESPEED_ENABLED must be true or false.');
  }
  const artifactDir = env['ARTIFACT_DIR']?.trim() ?? '';
  const artifactMaxBytes = Number(env['ARTIFACT_MAX_BYTES'] ?? 2097152);
  const artifactMaxPerScan = Number(env['ARTIFACT_MAX_PER_SCAN'] ?? 24);
  const artifactRetentionDays = Number(env['ARTIFACT_RETENTION_DAYS'] ?? 30);
  if (!Number.isSafeInteger(artifactMaxBytes) || artifactMaxBytes < 1024) {
    throw new Error('ARTIFACT_MAX_BYTES must be an integer of at least 1024.');
  }
  if (!Number.isSafeInteger(artifactMaxPerScan) || artifactMaxPerScan < 1) {
    throw new Error('ARTIFACT_MAX_PER_SCAN must be a positive integer.');
  }
  if (
    !Number.isSafeInteger(artifactRetentionDays) ||
    artifactRetentionDays < 1
  ) {
    throw new Error('ARTIFACT_RETENTION_DAYS must be a positive integer.');
  }
  return {
    port,
    host,
    nodeEnv,
    databaseUrl,
    scanningEnabled,
    pageSpeedApiKey,
    pageSpeedEnabled: pageSpeed === 'true' || pageSpeed === '1',
    artifactDir,
    artifactMaxBytes,
    artifactMaxPerScan,
    artifactRetentionDays,
  };
}

export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
  return loadConfig();
}
