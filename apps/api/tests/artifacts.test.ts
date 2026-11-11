import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ArtifactStore } from '../src/modules/scanning/artifacts.js';

const database = async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nabiz-artifact-'));
  const url = `file:${join(directory, 'artifacts.db').replaceAll('\\', '/')}`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  await db.$executeRawUnsafe(
    'CREATE TABLE "ScanJob" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "urls" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT \'queued\', "progress" INTEGER NOT NULL DEFAULT 0, "error" TEXT, "result" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)',
  );
  await db.$executeRawUnsafe(
    'CREATE TABLE "ScanArtifact" ("id" TEXT NOT NULL PRIMARY KEY, "scanId" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "viewport" TEXT NOT NULL, "url" TEXT NOT NULL, "selector" TEXT, "label" TEXT, "fileName" TEXT NOT NULL, "bytes" INTEGER NOT NULL, "width" INTEGER, "height" INTEGER, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  return { db, directory };
};

describe('Ekran görüntüsü deposu', () => {
  it('görselleri kaydeder, listeler ve yalnızca sahibine servis eder', async () => {
    const { db, directory } = await database();
    const store = new ArtifactStore(db, join(directory, 'files'), {
      maxBytes: 1024,
      maxPerScan: 4,
      retentionDays: 30,
    });
    try {
      const owner = 'user-owner';
      const other = 'user-other';
      const { saved, skipped } = await store.save(owner, 'scan-1', [
        {
          kind: 'page',
          viewport: 'desktop',
          url: 'https://example.com',
          pageKey: 'https://example.com|desktop',
          label: 'masaüstü',
          data: Buffer.from('görsel-1'),
        },
        {
          kind: 'page',
          viewport: 'mobile',
          url: 'https://example.com',
          pageKey: 'https://example.com|mobile',
          data: Buffer.from('görsel-2'),
        },
      ]);
      expect(saved).toHaveLength(2);
      expect(skipped).toEqual([]);
      // Görseller diske yazılır ve üst veri veritabanında tutulur.
      const rows = await db.scanArtifact.count({ where: { scanId: 'scan-1' } });
      expect(rows).toBe(2);
      const read = await store.read(saved[0]!.id, owner);
      expect(read?.toString()).toBe('görsel-1');
      // Başka kullanıcı görseli okuyamaz.
      expect(await store.read(saved[0]!.id, other)).toBeUndefined();
      expect(await store.list('scan-1', other)).toEqual([]);
    } finally {
      await db.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('boyut ve adet sınırlarını uygular', async () => {
    const { db, directory } = await database();
    const store = new ArtifactStore(db, join(directory, 'files'), {
      maxBytes: 16,
      maxPerScan: 2,
      retentionDays: 30,
    });
    try {
      const { saved, skipped } = await store.save('user', 'scan-2', [
        {
          kind: 'page',
          viewport: 'desktop',
          url: 'https://example.com',
          data: Buffer.alloc(64),
        },
        {
          kind: 'page',
          viewport: 'desktop',
          url: 'https://example.com',
          data: Buffer.from('küçük'),
        },
        {
          kind: 'element',
          viewport: 'mobile',
          url: 'https://example.com',
          data: Buffer.from('ikinci'),
        },
        {
          kind: 'element',
          viewport: 'mobile',
          url: 'https://example.com',
          data: Buffer.from('üçüncü'),
        },
      ]);
      // Büyük görsel atlanır, adet sınırı uygulanır.
      expect(saved).toHaveLength(2);
      const reasons = skipped.map((item) => item.reason);
      expect(reasons).toContain('Görsel boyut sınırını aştı');
      expect(reasons).toContain('Tarama görsel sınırına ulaştı');
    } finally {
      await db.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('süresi dolan görselleri temizler', async () => {
    const { db, directory } = await database();
    const store = new ArtifactStore(db, join(directory, 'files'), {
      maxBytes: 1024,
      maxPerScan: 10,
      retentionDays: 1,
    });
    try {
      const { saved } = await store.save('user', 'scan-3', [
        {
          kind: 'page',
          viewport: 'desktop',
          url: 'https://example.com',
          data: Buffer.from('eski'),
        },
      ]);
      await db.scanArtifact.update({
        where: { id: saved[0]!.id },
        data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
      });
      const removed = await store.purgeExpired();
      expect(removed).toBe(1);
      expect(await db.scanArtifact.count()).toBe(0);
    } finally {
      await db.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
