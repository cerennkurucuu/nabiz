import type { PrismaClient } from '@prisma/client';
import { AuthError } from '../auth/auth.security.js';
import { normalizeScanUrl } from './url-policy.js';
import { compareReports, type PageReport } from './findings.js';
import type { CheckResult } from './checks.js';
import type { PageSpeedProvider, PageSpeedResult } from './pagespeed.js';
import type { EngineReport, EngineStatus } from './engine.js';
import type { ArtifactInput, ArtifactStore } from './artifacts.js';

export interface ScanResult {
  pages: PageReport[];
  complete: boolean;
  /** Kural başına kontrol sonuçları (yeni kayıtlarda bulunur). */
  checks?: CheckResult[];
  /** PageSpeed Insights sonuçları (Chromium taramasından bağımsız). */
  pageSpeed?: PageSpeedResult[];
  /** Motor bazında durum (yeni kayıtlarda bulunur). */
  engines?: EngineReport[];
}

/** Tarama sırasında üretilen, kayda yazılmayan ekran görüntüleri. */
export interface ScanRunResult extends ScanResult {
  captures?: ArtifactInput[];
}

export interface ScanRunner {
  run(
    urls: string[],
    signal: AbortSignal,
    progress: (value: number) => Promise<void>,
  ): Promise<ScanRunResult>;
}

/** PageSpeed Insights sağlayıcısı; testlerde sahte uygulama kullanılabilir. */
export type { PageSpeedProvider };
export interface JobOptions {
  enabled: boolean;
  timeoutMs: number;
  queueTimeoutMs: number;
  hourlyLimit: number;
  maxQueued: number;
}
export const jobDefaults: JobOptions = {
  enabled: false,
  timeoutMs: 90000,
  queueTimeoutMs: 300000,
  hourlyLimit: 10,
  maxQueued: 100,
};
const metadata = {
  id: true,
  urls: true,
  status: true,
  progress: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;
const invalid = (message: string) =>
  new AuthError(400, 'INVALID_SCAN', message);

// One API/worker process per SQLite database. A claim is atomic; quotas are transactional.
export class JobsService {
  readonly options: JobOptions;
  private active:
    | { id: string; controller: AbortController; done: Promise<void> }
    | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  constructor(
    private readonly db: PrismaClient,
    private readonly runner: ScanRunner,
    options: Partial<JobOptions> = {},
    // PageSpeed sağlayıcısı verilmezse Chromium taramasından bağımsız olarak
    // çalışmaz; bu durumda raporda yalnızca Chromium kontrolleri yer alır.
    private readonly pageSpeed?: PageSpeedProvider,
    // Ekran görüntüsü deposu verilmezse görseller kayda yazılmaz.
    private readonly artifactStore?: ArtifactStore,
  ) {
    this.options = { ...jobDefaults, ...options };
    for (const key of [
      'timeoutMs',
      'queueTimeoutMs',
      'hourlyLimit',
      'maxQueued',
    ] as const) {
      if (!Number.isSafeInteger(this.options[key]) || this.options[key] < 1)
        throw new Error('Invalid job limit');
    }
  }
  async start() {
    if (this.timer) return;
    await this.db.scanJob.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', error: 'SERVER_RESTARTED' },
    });
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.tick().catch(() =>
        console.error(JSON.stringify({ event: 'queue_failed' })),
      );
    }, 1000);
    this.timer.unref();
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
    this.active?.controller.abort();
    await this.active?.done;
  }
  async create(userId: string, input: unknown) {
    if (!this.options.enabled)
      throw new AuthError(
        503,
        'SCANNING_DISABLED',
        'Açık internet taraması güvenlik doğrulaması tamamlanana kadar kapalı.',
      );
    if (
      !Array.isArray(input) ||
      input.length < 1 ||
      input.length > 3 ||
      input.some((x) => typeof x !== 'string' || x.length > 2048)
    )
      throw invalid('Bir ile üç arasında geçerli URL girin.');
    const urls = input.map((x) => normalizeScanUrl(x as string).href);
    if (new Set(urls).size !== urls.length)
      throw invalid('Aynı URL birden fazla kez eklenemez.');
    return this.db.$transaction(async (tx) => {
      const active = await tx.scanJob.count({
        where: { userId, status: { in: ['queued', 'running'] } },
      });
      const recent = await tx.scanJob.count({
        where: { userId, createdAt: { gte: new Date(Date.now() - 3600000) } },
      });
      if (active || recent >= this.options.hourlyLimit)
        throw new AuthError(
          429,
          'SCAN_QUOTA',
          active
            ? 'Devam eden taramanızın bitmesini bekleyin.'
            : 'Saatlik tarama sınırına ulaştınız.',
        );
      if (
        (await tx.scanJob.count({ where: { status: 'queued' } })) >=
        this.options.maxQueued
      )
        throw new AuthError(
          503,
          'QUEUE_FULL',
          'Tarama kuyruğu dolu. Daha sonra tekrar deneyin.',
        );
      return tx.scanJob.create({
        data: { userId, urls: JSON.stringify(urls) },
        select: metadata,
      });
    });
  }
  list(userId: string) {
    return this.db.scanJob.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: metadata,
    });
  }
  async get(userId: string, id: string) {
    const row = await this.db.scanJob.findFirst({
      where: { userId, id },
      select: { ...metadata, result: true },
    });
    if (!row) throw new AuthError(404, 'NOT_FOUND', 'Tarama bulunamadı.');
    return row;
  }
  async compare(
    userId: string,
    beforeId: string,
    afterId: string,
    inputUrl: string,
  ) {
    const before = await this.get(userId, beforeId);
    const after = await this.get(userId, afterId);
    const url = normalizeScanUrl(inputUrl).href;
    if (beforeId === afterId || before.createdAt > after.createdAt)
      throw invalid('Önce eski, sonra yeni taramayı seçin.');
    if (before.status !== 'completed' || after.status !== 'completed')
      throw invalid('Karşılaştırma için sonuçlanmış iki tarama seçin.');
    if (
      !(JSON.parse(before.urls) as string[]).includes(url) ||
      !(JSON.parse(after.urls) as string[]).includes(url)
    )
      throw invalid('İki taramada da aynı URL bulunmalı.');
    const pages = (value: string | null) =>
      value
        ? (JSON.parse(value) as ScanResult).pages.filter((p) => p.url === url)
        : [];
    return compareReports(pages(before.result), pages(after.result));
  }
  async cancel(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.scanJob.updateMany({
      where: { userId, id, status: { in: ['queued', 'running'] } },
      data: { status: 'cancelled' },
    });
    if (this.active?.id === id) this.active.controller.abort();
    return this.get(userId, id);
  }
  async tick() {
    if (this.stopped || this.active) return;
    const active = {
      id: '',
      controller: new AbortController(),
      done: Promise.resolve(),
    };
    this.active = active;
    active.done = this.work(active).finally(() => {
      if (this.active === active) this.active = undefined;
    });
    await active.done;
  }
  private async work(active: NonNullable<JobsService['active']>) {
    await this.db.scanJob.updateMany({
      where: {
        status: 'queued',
        createdAt: { lt: new Date(Date.now() - this.options.queueTimeoutMs) },
      },
      data: { status: 'failed', error: 'QUEUE_TIMEOUT' },
    });
    if (this.stopped) return;
    const job = await this.db.scanJob.findFirst({
      where: { status: 'queued' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!job) return;
    active.id = job.id;
    const claimed = await this.db.scanJob.updateMany({
      where: { id: job.id, status: 'queued' },
      data: { status: 'running' },
    });
    if (!claimed.count) return;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      active.controller.abort();
    }, this.options.timeoutMs);
    try {
      active.controller.signal.throwIfAborted();
      const result = await this.runner.run(
        JSON.parse(job.urls) as string[],
        active.controller.signal,
        async (progress) => {
          if (!Number.isFinite(progress)) return;
          await this.db.scanJob.updateMany({
            where: { id: job.id, status: 'running' },
            data: { progress: Math.max(0, Math.min(99, Math.floor(progress))) },
          });
        },
      );
      active.controller.signal.throwIfAborted();
      // PageSpeed Insights Chromium taramasından bağımsızdır: başarısız olsa
      // bile nedeni saklanır, sonuç atlanmaz.
      let pageSpeed: PageSpeedResult[] = [];
      if (this.pageSpeed) {
        pageSpeed = await this.pageSpeed
          .collect(JSON.parse(job.urls) as string[], active.controller.signal)
          .catch(() => []);
      }
      // Ekran görüntüleri JSON'a gömülmez; dosya deposuna yazılır.
      const { captures = [], ...rest } = result;
      const stored: ScanResult = {
        ...rest,
        pageSpeed,
        engines: [...(rest.engines ?? []), pageSpeedEngine(pageSpeed)],
      };
      if (captures.length && this.artifactStore) {
        const { saved } = await this.artifactStore.save(
          job.userId,
          job.id,
          captures,
        );
        for (const page of stored.pages) {
          const refs = saved
            .filter((item) => item.pageKey === `${page.url}|${page.viewport}`)
            .map((item) => ({
              id: item.id,
              kind: item.kind,
              viewport: item.viewport,
              url: item.url,
              label: item.label,
              selector: item.selector,
              bytes: item.bytes,
              width: item.width,
              height: item.height,
            }));
          if (refs.length) page.artifacts = refs;
        }
      }
      await this.db.scanJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: {
          status: 'completed',
          progress: 100,
          result: JSON.stringify(stored),
        },
      });
    } catch {
      await this.db.scanJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: {
          status: 'failed',
          error: timedOut
            ? 'TIMEOUT'
            : this.stopped
              ? 'SERVER_STOPPED'
              : 'SCAN_FAILED',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * PageSpeed motor durumu. Diğer motorlardan bağımsızdır: PageSpeed
 * başarısız olduğunda diğer motorların sonuçları etkilenmez.
 */
function pageSpeedEngine(results: PageSpeedResult[]): EngineReport {
  if (!results.length)
    return {
      id: 'pagespeed',
      status: 'unavailable',
      message: 'PageSpeed Insights çalıştırılmadı.',
      findings: 0,
      checks: 0,
    };
  const ok = results.filter((item) => item.ok).length;
  const failed = results.length - ok;
  const status: EngineStatus =
    ok === 0 ? 'failed' : failed > 0 ? 'partial' : 'completed';
  const reasons = [
    ...new Set(
      results
        .filter((item) => !item.ok)
        .map((item) => item.error ?? 'Bilinmeyen hata'),
    ),
  ];
  return {
    id: 'pagespeed',
    status,
    message:
      ok === results.length
        ? 'Mobil ve masaüstü PageSpeed sorguları tamamlandı.'
        : `${ok}/${results.length} PageSpeed sorgusu tamamlandı. ${reasons[0] ?? ''}`.trim(),
    findings: 0,
    checks: results.length,
  };
}
