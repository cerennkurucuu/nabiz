import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { ArtifactRef } from './findings.js';

/**
 * Ekran görüntüsü deposu.
 *
 * Görseller JSON içine base64 olarak gömülmez; dosya deposunda saklanır ve
 * veritabanında yalnızca üst veri tutulur. Erişim tarama sahibine bağlıdır,
 * dosyalar boyut ve adet sınırına tabidir ve eski kayıtlar silinir.
 */

export interface ArtifactLimits {
  /** Tek bir görsel için izin verilen en fazla bayt. */
  maxBytes: number;
  /** Bir tarama için saklanabilecek en fazla görsel. */
  maxPerScan: number;
  /** Kaç günden sonra görseller silinir. */
  retentionDays: number;
}

export const artifactDefaults: ArtifactLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxPerScan: 24,
  retentionDays: 30,
};

export interface ArtifactInput {
  kind: 'page' | 'element';
  viewport: 'desktop' | 'mobile';
  url: string;
  /** Hangi sayfa kaydına ait olduğunu belirleyen anahtar. */
  pageKey?: string | undefined;
  selector?: string | undefined;
  label?: string | undefined;
  data: Buffer;
  width?: number | undefined;
  height?: number | undefined;
}

export interface StoredArtifact extends ArtifactRef {
  id: string;
  pageKey?: string | undefined;
}

const userFolder = (userId: string) =>
  createHash('sha256').update(userId).digest('hex').slice(0, 16);

export class ArtifactStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly root: string,
    private readonly limits: ArtifactLimits = artifactDefaults,
  ) {}

  /**
   * Görselleri diske yazar ve veritabanına kaydeder. Boyut ve adet sınırı
   * aşılan görseller atlanır; sınır bilgisi çağırana döner.
   */
  async save(
    userId: string,
    scanId: string,
    inputs: ArtifactInput[],
  ): Promise<{
    saved: StoredArtifact[];
    skipped: { reason: string; count: number }[];
  }> {
    const existing = await this.db.scanArtifact.count({ where: { scanId } });
    const saved: StoredArtifact[] = [];
    const skipped = new Map<string, number>();
    let remaining = Math.max(0, this.limits.maxPerScan - existing);

    for (const input of inputs) {
      if (remaining <= 0) {
        skipped.set(
          'Tarama görsel sınırına ulaştı',
          (skipped.get('Tarama görsel sınırına ulaştı') ?? 0) + 1,
        );
        continue;
      }
      if (input.data.length > this.limits.maxBytes) {
        skipped.set(
          'Görsel boyut sınırını aştı',
          (skipped.get('Görsel boyut sınırını aştı') ?? 0) + 1,
        );
        continue;
      }
      const id = `${scanId}_${input.viewport}_${input.kind}_${saved.length}_${Date.now().toString(36)}`;
      const fileName = `${id}.png`;
      const target = join(this.root, userFolder(userId), scanId, fileName);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, input.data);
      const row = await this.db.scanArtifact.create({
        data: {
          id,
          scanId,
          userId,
          kind: input.kind,
          viewport: input.viewport,
          url: input.url,
          selector: input.selector ?? null,
          label: input.label ?? null,
          fileName,
          bytes: input.data.length,
          width: input.width ?? null,
          height: input.height ?? null,
        },
      });
      saved.push({
        id: row.id,
        kind: input.kind,
        viewport: input.viewport,
        url: input.url,
        label: input.label ?? undefined,
        selector: input.selector ?? undefined,
        bytes: row.bytes,
        width: row.width ?? undefined,
        height: row.height ?? undefined,
        ...(input.pageKey ? { pageKey: input.pageKey } : {}),
      });
      remaining -= 1;
    }

    return {
      saved,
      skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
    };
  }

  /** Görselin yolunu yalnızca sahibi olan kullanıcı için çözer. */
  async resolve(
    artifactId: string,
    userId: string,
  ): Promise<{ path: string; bytes: number } | undefined> {
    const row = await this.db.scanArtifact.findFirst({
      where: { id: artifactId, userId },
      select: { fileName: true, bytes: true, scanId: true },
    });
    if (!row) return undefined;
    return {
      path: join(this.root, userFolder(userId), row.scanId, row.fileName),
      bytes: row.bytes,
    };
  }

  /** Bir taramanın görsellerini yalnızca sahibine listeler. */
  async list(
    scanId: string,
    userId: string,
  ): Promise<
    {
      id: string;
      kind: string;
      viewport: string;
      url: string;
      label: string | null;
      bytes: number;
    }[]
  > {
    return this.db.scanArtifact.findMany({
      where: { scanId, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        viewport: true,
        url: true,
        label: true,
        bytes: true,
      },
    });
  }

  async read(artifactId: string, userId: string): Promise<Buffer | undefined> {
    const resolved = await this.resolve(artifactId, userId);
    if (!resolved) return undefined;
    try {
      return await readFile(resolved.path);
    } catch {
      return undefined;
    }
  }

  /** Saklama süresini aşan görselleri siler. */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.limits.retentionDays * 24 * 60 * 60 * 1000,
    );
    const expired = await this.db.scanArtifact.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, fileName: true, scanId: true, userId: true },
    });
    let removed = 0;
    for (const row of expired) {
      try {
        await rm(
          join(this.root, userFolder(row.userId), row.scanId, row.fileName),
          {
            force: true,
          },
        );
      } catch {
        // Dosya zaten yoksa kayıt yine de temizlenir.
      }
      await this.db.scanArtifact.deleteMany({ where: { id: row.id } });
      removed += 1;
    }
    return removed;
  }
}
