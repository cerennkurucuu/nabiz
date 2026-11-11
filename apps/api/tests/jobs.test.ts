import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import request from 'supertest';
import { authFixture } from './helpers/auth-fixture.js';
import {
  JobsService,
  type ScanRunner,
} from '../src/modules/scanning/jobs.service.js';
import { createApp } from '../src/app.js';
import { finding } from '../src/modules/scanning/findings.js';

describe('Scan lifecycle and ownership with real SQLite', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let alice: Awaited<ReturnType<typeof fixture.login>>;
  let bob: Awaited<ReturnType<typeof fixture.login>>;
  beforeAll(async () => {
    fixture = await authFixture();
  });
  beforeEach(async () => {
    await fixture.reset();
    alice = await fixture.login();
    bob = await fixture.login('bob');
  });
  afterAll(async () => {
    await fixture.close();
  });
  const runner = (): ScanRunner => ({
    run: vi.fn(async (_urls, _signal, progress) => {
      await progress(50);
      return { pages: [], complete: true };
    }),
  });
  const urls = ['https://example.com/'];
  it('keeps public scanning closed by default', async () => {
    await expect(
      new JobsService(fixture.db, runner()).create(alice.user.id, urls),
    ).rejects.toMatchObject({ code: 'SCANNING_DISABLED' });
  });
  it.each([
    [],
    ['a'],
    ['https://example.com', 'https://example.com/#same'],
    Array(4).fill('https://example.com'),
    ['http://127.0.0.1'],
  ])('rejects invalid URLs/count/duplicates %j', async (input) => {
    await expect(
      new JobsService(fixture.db, runner(), { enabled: true }).create(
        alice.user.id,
        input,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('enforces active quota, runs once, persists progress and isolates records', async () => {
    const worker = runner();
    const jobs = new JobsService(fixture.db, worker, { enabled: true });
    const job = await jobs.create(alice.user.id, urls);
    await expect(jobs.create(alice.user.id, urls)).rejects.toMatchObject({
      code: 'SCAN_QUOTA',
    });
    await expect(jobs.get(bob.user.id, job.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await jobs.list(bob.user.id)).toEqual([]);
    await Promise.all([jobs.tick(), jobs.tick()]);
    expect(worker.run).toHaveBeenCalledTimes(1);
    expect(await jobs.get(alice.user.id, job.id)).toMatchObject({
      status: 'completed',
      progress: 100,
    });
  });
  it('counts completed jobs toward hourly quota and bounds the queue', async () => {
    const jobs = new JobsService(fixture.db, runner(), {
      enabled: true,
      hourlyLimit: 1,
      maxQueued: 1,
    });
    await jobs.create(alice.user.id, urls);
    await expect(jobs.create(bob.user.id, urls)).rejects.toMatchObject({
      code: 'QUEUE_FULL',
    });
    await jobs.tick();
    await expect(jobs.create(alice.user.id, urls)).rejects.toMatchObject({
      code: 'SCAN_QUOTA',
    });
  });
  it('cancels only owned jobs and never runs cancelled queued jobs', async () => {
    const worker = runner();
    const jobs = new JobsService(fixture.db, worker, { enabled: true });
    const job = await jobs.create(alice.user.id, urls);
    await expect(jobs.cancel(bob.user.id, job.id)).rejects.toMatchObject({
      status: 404,
    });
    await jobs.cancel(alice.user.id, job.id);
    await jobs.tick();
    expect(worker.run).not.toHaveBeenCalled();
    expect(await jobs.get(alice.user.id, job.id)).toMatchObject({
      status: 'cancelled',
    });
  });
  it('times out and aborts active work', async () => {
    const worker: ScanRunner = {
      run: async (_urls, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          }),
        ),
    };
    const jobs = new JobsService(fixture.db, worker, {
      enabled: true,
      timeoutMs: 20,
    });
    const job = await jobs.create(alice.user.id, urls);
    await jobs.tick();
    expect(await jobs.get(alice.user.id, job.id)).toMatchObject({
      status: 'failed',
      error: 'TIMEOUT',
    });
  });
  it('recovers interrupted jobs and expires the queue without resetting data', async () => {
    const jobs = new JobsService(fixture.db, runner(), { enabled: true });
    const job = await jobs.create(alice.user.id, urls);
    await fixture.db.scanJob.update({
      where: { id: job.id },
      data: { createdAt: new Date(0) },
    });
    await jobs.tick();
    expect(await jobs.get(alice.user.id, job.id)).toMatchObject({
      status: 'failed',
      error: 'QUEUE_TIMEOUT',
    });
    await fixture.db.scanJob.update({
      where: { id: job.id },
      data: { status: 'running' },
    });
    await jobs.start();
    await jobs.stop();
    expect(await jobs.get(alice.user.id, job.id)).toMatchObject({
      status: 'failed',
      error: 'SERVER_RESTARTED',
    });
  });
  it('HTTP requires authentication, CSRF and ownership on every route', async () => {
    const jobs = new JobsService(fixture.db, runner(), { enabled: true });
    const app = createApp(fixture.auth, jobs);
    await request(app).get('/api/scans').expect(401);
    const cookie = `nabiz-session=${alice.token}`;
    const context = (await fixture.auth.session(alice.token))!;
    await request(app)
      .post('/api/scans')
      .set('Cookie', cookie)
      .send({ urls })
      .expect(403);
    const response = await request(app)
      .post('/api/scans')
      .set('Cookie', cookie)
      .set('Origin', fixture.auth.config.appOrigin)
      .set('X-CSRF-Token', context.csrfToken)
      .send({ urls, userId: bob.user.id })
      .expect(201);
    const id = response.body.data.id as string;
    await request(app)
      .get(`/api/scans/${id}`)
      .set('Cookie', `nabiz-session=${bob.token}`)
      .expect(404);
    await request(app)
      .get(`/api/scans/${id}`)
      .set('Cookie', cookie)
      .expect(200);
  });
  it('compares only owned completed scans sharing the selected URL', async () => {
    const jobs = new JobsService(fixture.db, runner(), { enabled: true });
    const old = await jobs.create(alice.user.id, urls);
    await jobs.tick();
    const next = await jobs.create(alice.user.id, urls);
    await jobs.tick();
    const pages = [
      {
        url: urls[0]!,
        viewport: 'mobile',
        complete: true,
        findings: [finding('X01', urls[0]!, '#input', 'missing')],
      },
    ];
    await fixture.db.scanJob.update({
      where: { id: old.id },
      data: { result: JSON.stringify({ pages, complete: true }) },
    });
    await expect(
      jobs.compare(bob.user.id, old.id, next.id, urls[0]!),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      jobs.compare(alice.user.id, old.id, next.id, 'https://other.example/'),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await jobs.compare(alice.user.id, old.id, next.id, urls[0]!),
    ).toMatchObject({ resolved: [], unverified: [expect.anything()] });
  });
});
