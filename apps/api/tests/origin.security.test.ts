import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authFixture } from './helpers/auth-fixture.js';
import { createApp } from '../src/app.js';
import {
  JobsService,
  type ScanRunner,
} from '../src/modules/scanning/jobs.service.js';

// Tek kanonik adres: API yalnızca yapılandırılmış origin'den gelen yazma
// isteklerini kabul eder. Başka bir origin (örneğin 127.0.0.1) reddedilir.
describe('Origin and CSRF checks use a single configured origin', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let app: ReturnType<typeof createApp>;
  let token = '';
  let csrf = '';

  beforeAll(async () => {
    fixture = await authFixture();
    const runner: ScanRunner = {
      run: async () => ({ pages: [], complete: true }),
    };
    const jobs = new JobsService(fixture.db, runner, { enabled: true });
    app = createApp(fixture.auth, jobs);
    const login = await fixture.login();
    token = login.token;
    csrf = (await fixture.auth.session(token))!.csrfToken;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('exposes the configured origin', () => {
    expect(fixture.auth.config.appOrigin).toBe('http://localhost:4300');
  });

  it('accepts the challenge only from the configured origin', async () => {
    await request(app)
      .post('/api/auth/google/challenge')
      .set('Origin', 'http://localhost:4300')
      .send({})
      .expect(200);
    const rejected = await request(app)
      .post('/api/auth/google/challenge')
      .set('Origin', 'http://127.0.0.1:4300')
      .send({})
      .expect(403);
    expect(rejected.body.error.code).toBe('CSRF_REJECTED');
  });

  it('accepts a scan only from the configured origin with a valid CSRF token', async () => {
    await request(app)
      .post('/api/scans')
      .set('Cookie', `nabiz-session=${token}`)
      .set('Origin', 'http://localhost:4300')
      .set('X-CSRF-Token', csrf)
      .send({ urls: ['https://example.com'] })
      .expect(201);

    const wrongOrigin = await request(app)
      .post('/api/scans')
      .set('Cookie', `nabiz-session=${token}`)
      .set('Origin', 'http://127.0.0.1:4300')
      .set('X-CSRF-Token', csrf)
      .send({ urls: ['https://example.org'] })
      .expect(403);
    expect(wrongOrigin.body.error.code).toBe('CSRF_REJECTED');

    const missingToken = await request(app)
      .post('/api/scans')
      .set('Cookie', `nabiz-session=${token}`)
      .set('Origin', 'http://localhost:4300')
      .send({ urls: ['https://example.net'] })
      .expect(403);
    expect(missingToken.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects a cross-site request even with a valid token', async () => {
    const rejected = await request(app)
      .post('/api/scans')
      .set('Cookie', `nabiz-session=${token}`)
      .set('Origin', 'http://localhost:4300')
      .set('X-CSRF-Token', csrf)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ urls: ['https://example.io'] })
      .expect(403);
    expect(rejected.body.error.code).toBe('CSRF_REJECTED');
  });
});
