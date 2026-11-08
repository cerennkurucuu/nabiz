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
  return { port, host, nodeEnv, databaseUrl };
}

export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
  return loadConfig();
}
