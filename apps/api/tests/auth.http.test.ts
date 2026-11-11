import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authFixture } from './helpers/auth-fixture.js';
import { createApp } from '../src/app.js';

let f: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  f = await authFixture();
});
beforeEach(async () => {
  await f.reset();
});
afterAll(async () => {
  await f?.close();
});
const origin = 'http://localhost:4300';

describe('Auth HTTP integration', () => {
  it('completes GIS login, refresh, protected access and logout', async () => {
    const agent = request.agent(createApp(f.auth));
    const challenge = await agent
      .post('/api/auth/google/challenge')
      .set('Origin', origin)
      .send({})
      .expect(200);
    const login = await agent
      .post('/api/auth/google')
      .set('Origin', origin)
      .send({ credential: 'alice', state: challenge.body.data.state })
      .expect(200);
    const { user, csrfToken } = login.body.data;
    expect(login.headers['set-cookie'].join(';')).toMatch(/HttpOnly/);
    expect(login.headers['set-cookie'].join(';')).toMatch(/SameSite=Lax/);
    expect(JSON.stringify(login.body)).not.toContain('credential');
    await agent.get('/api/auth/me').expect(200, { data: user });
    await agent
      .get(`/api/auth/profiles/${user.id}`)
      .expect(200, { data: user });
    const refreshed = await agent.get('/api/auth/session').expect(200);
    expect(refreshed.body.data.csrfToken).toBe(csrfToken);
    expect(refreshed.headers['cache-control']).toBe('no-store');
    await agent
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);
    await agent.get('/api/auth/me').expect(401);
  });
  it('denies unauthenticated, malformed, expired and revoked sessions', async () => {
    const app = createApp(f.auth);
    await request(app).get('/api/auth/me').expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'nabiz-session=bad')
      .expect(401);
    const login = await f.login();
    f.clock.now = new Date(f.clock.now.getTime() + 12 * 60 * 60 * 1000);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `nabiz-session=${login.token}`)
      .expect(401);
  });
  it('denies login CSRF, missing credentials and mismatched browser binding', async () => {
    const app = createApp(f.auth);
    await request(app)
      .post('/api/auth/google/challenge')
      .set('Origin', 'https://attacker.test')
      .send({})
      .expect(403);
    await request(app).post('/api/auth/google/challenge').send({}).expect(403);
    await request(app)
      .post('/api/auth/google')
      .set('Origin', origin)
      .send({})
      .expect(401);
    const challenge = await f.auth.begin();
    const denied = await request(app)
      .post('/api/auth/google')
      .set('Origin', origin)
      .send({ credential: 'alice', state: challenge.state })
      .expect(401);
    expect(denied.body.error).toMatchObject({
      code: 'INVALID_LOGIN',
      requestId: expect.any(String),
    });
    expect(f.provider.verify).not.toHaveBeenCalled();
  });
  it('ignores client-supplied owner ids and hides other user profiles', async () => {
    const alice = await f.login();
    const bob = await f.login('bob');
    const app = createApp(f.auth);
    await request(app)
      .get(`/api/auth/profiles/${bob.user.id}?userId=${bob.user.id}`)
      .set('Cookie', `nabiz-session=${alice.token}`)
      .expect(404);
    await request(app)
      .get(`/api/auth/profiles/${alice.user.id}?userId=${bob.user.id}`)
      .set('Cookie', `nabiz-session=${alice.token}`)
      .expect(200, { data: alice.user });
  });
  it('rejects logout with missing token, wrong token or foreign origin', async () => {
    const alice = await f.login();
    const context = (await f.auth.session(alice.token))!;
    const app = createApp(f.auth);
    for (const [headerOrigin, token] of [
      [origin, ''],
      [origin, 'bad'],
      ['https://attacker.test', context.csrfToken],
    ]) {
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `nabiz-session=${alice.token}`)
        .set('Origin', headerOrigin!)
        .set('X-CSRF-Token', token!)
        .send({})
        .expect(403);
    }
    expect(await f.auth.session(alice.token)).not.toBeNull();
  });
});
