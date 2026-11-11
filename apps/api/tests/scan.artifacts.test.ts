import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { authFixture } from './helpers/auth-fixture.js';
import { BrowserRunner } from '../src/modules/scanning/browser.runner.js';
import { JobsService } from '../src/modules/scanning/jobs.service.js';
import { ArtifactStore } from '../src/modules/scanning/artifacts.js';
import { createApp } from '../src/app.js';
import { fixtureServer } from './helpers/fixture-server.js';

describe('Ekran görüntülerinin kaydı ve sunumu', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let alice: Awaited<ReturnType<typeof fixture.login>>;
  let bob: Awaited<ReturnType<typeof fixture.login>>;
  let server: Awaited<ReturnType<typeof fixtureServer>>;

  beforeAll(async () => {
    fixture = await authFixture();
    server = await fixtureServer();
  });
  beforeEach(async () => {
    await fixture.reset();
    alice = await fixture.login();
    bob = await fixture.login('bob');
  });
  afterAll(async () => {
    await server.close();
    await fixture.close();
  });

  it('görselleri kaydeder, raporla ilişkilendirir ve yalnızca sahibine servis eder', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nabiz-scan-artifact-'));
    const artifacts = new ArtifactStore(fixture.db, join(directory, 'files'));
    const jobs = new JobsService(
      fixture.db,
      new BrowserRunner(server.fetcher),
      { enabled: true },
      undefined,
      artifacts,
    );
    try {
      const job = await jobs.create(alice.user.id, [
        'https://fixture.nabiz.test/healthy',
      ]);
      await jobs.tick();
      const stored = await fixture.db.scanJob.findUnique({
        where: { id: job.id },
      });
      expect(stored?.status).toBe('completed');
      const result = JSON.parse(stored?.result ?? '{}');
      // Her iki görünüm için ekran görüntüsü kaydedildi.
      const refs = result.pages.flatMap(
        (page: { artifacts?: { id: string; kind: string }[] }) =>
          page.artifacts ?? [],
      );
      expect(
        refs.filter((item: { kind: string }) => item.kind === 'page'),
      ).toHaveLength(2);
      // Görseller JSON'a gömülmez.
      expect(stored?.result).not.toContain('data:image/png;base64');
      const rows = await fixture.db.scanArtifact.count({
        where: { scanId: job.id },
      });
      expect(rows).toBeGreaterThanOrEqual(2);

      const app = createApp(fixture.auth, jobs, artifacts);
      const owner = await request(app)
        .get(`/api/scans/artifacts/${refs[0]!.id}`)
        .set('Cookie', `nabiz-session=${alice.token}`)
        .expect(200);
      expect(owner.headers['content-type']).toContain('image/png');
      expect(owner.body.length).toBeGreaterThan(0);
      // Başka kullanıcı görsele erişemez.
      await request(app)
        .get(`/api/scans/artifacts/${refs[0]!.id}`)
        .set('Cookie', `nabiz-session=${bob.token}`)
        .expect(404);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120000);
});
