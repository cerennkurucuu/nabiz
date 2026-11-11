import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadAuthConfig } from '../../src/modules/auth/auth.config.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { IdentityProvider } from '../../src/modules/auth/google.provider.js';
import { vi } from 'vitest';

export async function authFixture() {
  const directory = mkdtempSync(resolve('.auth-test-'));
  const db = new PrismaClient({
    datasources: {
      db: { url: `file:${join(directory, 'test.db').replaceAll('\\', '/')}` },
    },
  });
  const migration = readFileSync(
    new URL(
      '../../prisma/migrations/20261108010000_auth/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  for (const sql of migration.split(';').filter((sql) => sql.trim()))
    await db.$executeRawUnsafe(sql);
  const scans = readFileSync(
    new URL(
      '../../prisma/migrations/20261109000000_scan_jobs/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  for (const sql of scans.split(';').filter((sql) => sql.trim()))
    await db.$executeRawUnsafe(sql);
  const artifacts = readFileSync(
    new URL(
      '../../prisma/migrations/20261111090000_scan_artifacts/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  for (const sql of artifacts.split(';').filter((sql) => sql.trim()))
    await db.$executeRawUnsafe(sql);
  const config = loadAuthConfig({
    NODE_ENV: 'test',
    GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
    APP_ORIGIN: 'http://localhost:4300',
  });
  const clock = { now: new Date('2026-11-08T10:00:00Z') };
  const provider: IdentityProvider = {
    verify: vi.fn(async (credential: string) => {
      if (
        !['alice', 'bob', 'alice-new-email', 'same-email-other-sub'].includes(
          credential,
        )
      )
        throw new Error('Invalid test identity');
      return {
        sub: credential.startsWith('alice')
          ? 'google-alice'
          : credential === 'bob'
            ? 'google-bob'
            : 'google-charlie',
        email:
          credential === 'alice-new-email'
            ? 'changed@example.test'
            : credential === 'same-email-other-sub'
              ? 'alice@example.test'
              : `${credential}@example.test`,
        name: credential,
      };
    }),
  };
  const auth = new AuthService(config, db, provider, () => clock.now);
  return {
    auth,
    db,
    clock,
    provider,
    async login(credential = 'alice', oldToken?: string) {
      const attempt = await auth.begin();
      return auth.finish(attempt.state, attempt.state, credential, oldToken);
    },
    async reset() {
      await db.scanJob.deleteMany();
      clock.now = new Date('2026-11-08T10:00:00Z');
      await db.session.deleteMany();
      await db.oAuthAttempt.deleteMany();
      await db.user.deleteMany();
      vi.clearAllMocks();
    },
    async close() {
      await db.$disconnect();
      // Only the unique directory created above is removed.
      rmSync(directory, { recursive: true });
    },
  };
}
