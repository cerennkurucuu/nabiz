import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { authFixture } from './helpers/auth-fixture.js';
import {
  JobsService,
  type ScanRunner,
} from '../src/modules/scanning/jobs.service.js';
import type { PageSpeedProvider } from '../src/modules/scanning/pagespeed.js';

describe('İş sonucu kontrol ve PageSpeed kayıtları', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let userId = '';

  beforeAll(async () => {
    fixture = await authFixture();
  });

  beforeEach(async () => {
    await fixture.reset();
    const login = await fixture.login();
    userId = login.user.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  const runner = (checks: unknown[] = []): ScanRunner => ({
    run: vi.fn(async () => ({
      pages: [],
      complete: true,
      checks: checks as never,
    })),
  });

  it('kontrol sonuçlarını ve PageSpeed sonuçlarını işe yazar', async () => {
    const pageSpeed: PageSpeedProvider = {
      collect: vi.fn(async () => [
        {
          url: 'https://example.com',
          strategy: 'mobile' as const,
          ok: true,
          scores: {
            performance: 88,
            accessibility: 70,
            bestPractices: 100,
            seo: 90,
          },
          checkedAt: new Date().toISOString(),
        },
        {
          url: 'https://example.com',
          strategy: 'desktop' as const,
          ok: false,
          error: 'PageSpeed Insights kotası doldu.',
          checkedAt: new Date().toISOString(),
        },
      ]),
    };
    const checks = [
      {
        id: 'T01:desktop:https://example.com',
        rule: 'T01' as const,
        title: 'JavaScript çalışma zamanı hataları',
        category: 'technical' as const,
        status: 'passed' as const,
        url: 'https://example.com',
        viewport: 'desktop' as const,
        message: 'Hata oluşmadı.',
        checkedAt: new Date().toISOString(),
      },
    ];
    const jobs = new JobsService(
      fixture.db,
      runner(checks),
      { enabled: true },
      pageSpeed,
    );
    const job = await jobs.create(userId, ['https://example.com']);
    await jobs.tick();
    const stored = await fixture.db.scanJob.findUnique({
      where: { id: job.id },
    });
    const result = JSON.parse(stored?.result ?? '{}');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].status).toBe('passed');
    expect(result.pageSpeed).toHaveLength(2);
    expect(result.pageSpeed[0].scores.performance).toBe(88);
    // Başarısız PageSpeed sonucu da saklanır, atlanmaz.
    expect(result.pageSpeed[1].ok).toBe(false);
    expect(result.pageSpeed[1].error).toContain('kota');
  });

  it('PageSpeed sağlayıcısı yoksa yalnızca Chromium sonuçları saklanır', async () => {
    const jobs = new JobsService(fixture.db, runner(), { enabled: true });
    const job = await jobs.create(userId, ['https://example.com']);
    await jobs.tick();
    const stored = await fixture.db.scanJob.findUnique({
      where: { id: job.id },
    });
    const result = JSON.parse(stored?.result ?? '{}');
    expect(result.pageSpeed).toEqual([]);
  });
});
