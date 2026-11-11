import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authFixture } from './helpers/auth-fixture.js';
import { fixtureServer } from './helpers/fixture-server.js';
import { createApp } from '../src/app.js';
import { JobsService } from '../src/modules/scanning/jobs.service.js';
import { BrowserRunner } from '../src/modules/scanning/browser.runner.js';

const TARGET = 'https://fixture.nabiz.test/broken';

interface FindingView {
  id: string;
  rule: string;
  message: string;
}
interface PageView {
  url: string;
  viewport: string;
  complete: boolean;
  screenshot?: string;
  findings: FindingView[];
}
interface JobView {
  id: string;
  status: string;
  progress: number;
  urls: string[];
  result: { complete: boolean; pages: PageView[] } | null;
}

describe('Scan flow end to end (HTTP, SQLite, Chromium)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let server: Awaited<ReturnType<typeof fixtureServer>>;
  let jobs: JobsService;
  let app: ReturnType<typeof createApp>;
  let alice: Awaited<ReturnType<ReturnType<typeof authFixture>['login']>>;
  let bob: Awaited<ReturnType<ReturnType<typeof authFixture>['login']>>;
  let csrf = '';

  const cookie = (token: string) => `nabiz-session=${token}`;
  const post = (token: string, path: string, body: unknown) =>
    request(app)
      .post(path)
      .set('Cookie', cookie(token))
      .set('Origin', fixture.auth.config.appOrigin)
      .set('X-CSRF-Token', csrf)
      .send(body);

  const waitFor = async (id: string): Promise<JobView> => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await request(app)
        .get(`/api/scans/${id}`)
        .set('Cookie', cookie(alice.token))
        .expect(200);
      const job = response.body.data as JobView;
      if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Scan did not finish in time');
  };

  beforeAll(async () => {
    fixture = await authFixture();
    server = await fixtureServer();
    jobs = new JobsService(fixture.db, new BrowserRunner(server.fetcher), {
      enabled: true,
    });
    await jobs.start();
    app = createApp(fixture.auth, jobs);
  });

  beforeEach(async () => {
    await fixture.reset();
    alice = await fixture.login();
    bob = await fixture.login('bob');
    csrf = (await fixture.auth.session(alice.token))!.csrfToken;
  });

  afterAll(async () => {
    await jobs.stop();
    await server.close();
    await fixture.close();
  });

  it('runs a real Chromium scan and returns the findings', async () => {
    const created = await post(alice.token, '/api/scans', {
      urls: [TARGET],
    }).expect(201);
    expect(created.body.data.status).toBe('queued');
    expect(created.body.data.urls).toEqual([TARGET]);
    const job = await waitFor(created.body.data.id as string);
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.result?.complete).toBe(true);
    expect(job.result?.pages).toHaveLength(2);
    expect(job.result?.pages.map((page) => page.viewport)).toEqual([
      'desktop',
      'mobile',
    ]);
    const rules = new Set(
      job.result?.pages.flatMap((page) =>
        page.findings.map((finding) => finding.rule),
      ),
    );
    // Yedi temel kural; yeni motorlar ek kurallar da üretebilir.
    expect(
      ['T01', 'T02', 'T03', 'T04', 'U02', 'U04', 'X01'].every((rule) =>
        rules.has(rule),
      ),
    ).toBe(true);
    // Ekran görüntüleri JSON'a gömülmez, dosya deposuna yazılır.
    expect(job.result?.pages.every((page) => !page.screenshot)).toBe(true);
    expect(job.result?.engines?.length).toBeGreaterThan(0);
    const stored = await fixture.db.scanJob.findUnique({
      where: { id: job.id },
    });
    expect(stored?.status).toBe('completed');
    expect(stored?.result).toContain('X01');
  }, 60000);

  it('keeps history and results private to the owner', async () => {
    const created = await post(alice.token, '/api/scans', {
      urls: [TARGET],
    }).expect(201);
    await waitFor(created.body.data.id as string);
    const mine = await request(app)
      .get('/api/scans')
      .set('Cookie', cookie(alice.token))
      .expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].result).toBeNull();
    const other = await request(app)
      .get('/api/scans')
      .set('Cookie', cookie(bob.token))
      .expect(200);
    expect(other.body.data).toEqual([]);
    await request(app)
      .get(`/api/scans/${created.body.data.id}`)
      .set('Cookie', cookie(bob.token))
      .expect(404);
    await request(app)
      .get(`/api/scans/compare/${created.body.data.id}/${created.body.data.id}`)
      .set('Cookie', cookie(bob.token))
      .expect(404);
  }, 60000);

  it('rejects unsafe targets, duplicates and oversized requests', async () => {
    const unsafe = await post(alice.token, '/api/scans', {
      urls: ['http://127.0.0.1/admin'],
    }).expect(400);
    expect(unsafe.body.error.code).toBe('UNSAFE_TARGET');
    const local = await post(alice.token, '/api/scans', {
      urls: ['http://localhost:3000'],
    }).expect(400);
    expect(local.body.error.code).toBe('UNSAFE_TARGET');
    const duplicate = await post(alice.token, '/api/scans', {
      urls: [TARGET, TARGET],
    }).expect(400);
    expect(duplicate.body.error.code).toBe('INVALID_SCAN');
    const tooMany = await post(alice.token, '/api/scans', {
      urls: [TARGET, `${TARGET}2`, `${TARGET}3`, `${TARGET}4`],
    }).expect(400);
    expect(tooMany.body.error.code).toBe('INVALID_SCAN');
  });

  it('cancels a queued scan and never runs it', async () => {
    const created = await post(alice.token, '/api/scans', {
      urls: [TARGET],
    }).expect(201);
    const cancelled = await post(
      alice.token,
      `/api/scans/${created.body.data.id}/cancel`,
      {},
    ).expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    await jobs.tick();
    const after = await request(app)
      .get(`/api/scans/${created.body.data.id}`)
      .set('Cookie', cookie(alice.token))
      .expect(200);
    expect(after.body.data.status).toBe('cancelled');
  });

  it('compares two completed scans of the same address', async () => {
    const first = await post(alice.token, '/api/scans', {
      urls: [TARGET],
    }).expect(201);
    await waitFor(first.body.data.id as string);
    const second = await post(alice.token, '/api/scans', {
      urls: [TARGET],
    }).expect(201);
    await waitFor(second.body.data.id as string);
    const comparison = await request(app)
      .get(
        `/api/scans/compare/${first.body.data.id}/${second.body.data.id}?url=${encodeURIComponent(TARGET)}`,
      )
      .set('Cookie', cookie(alice.token))
      .expect(200);
    expect(comparison.body.data.continuing.length).toBeGreaterThan(0);
    expect(comparison.body.data.added).toEqual([]);
    expect(comparison.body.data.resolved).toEqual([]);
  }, 90000);
});
