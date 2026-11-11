import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authFixture } from './helpers/auth-fixture.js';
import { hashToken } from '../src/modules/auth/auth.security.js';
import { findOwnedRecord } from '../src/modules/auth/auth.middleware.js';

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

describe('Google login and persistent sessions', () => {
  it('creates a user and stores only a session hash', async () => {
    const login = await f.login();
    const row = await f.db.session.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashToken(login.token));
    expect(row.tokenHash).not.toBe(login.token);
    expect((await f.auth.session(login.token))?.user).toEqual(login.user);
    expect(f.provider.verify).toHaveBeenCalledWith('alice', expect.any(String));
    expect(await f.db.oAuthAttempt.count()).toBe(0);
  });
  it('identifies users by sub, updates email without creating a second account', async () => {
    const first = await f.login();
    const second = await f.login('alice-new-email', first.token);
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.email).toBe('changed@example.test');
    expect(await f.db.user.count()).toBe(1);
    expect(await f.auth.session(first.token)).toBeNull();
    expect(await f.auth.session(second.token)).not.toBeNull();
  });
  it('does not merge different Google subs with the same email', async () => {
    const first = await f.login();
    const other = await f.login('same-email-other-sub');
    expect(other.user.email).toBe(first.user.email);
    expect(other.user.id).not.toBe(first.user.id);
  });
  it('rejects missing, unknown and expired sessions and revokes on logout', async () => {
    expect(await f.auth.session(undefined)).toBeNull();
    expect(await f.auth.session('unknown')).toBeNull();
    const login = await f.login();
    const session = (await f.auth.session(login.token))!;
    await f.auth.logout(session);
    expect(await f.auth.session(login.token)).toBeNull();
    const next = await f.login();
    f.clock.now = new Date(f.clock.now.getTime() + 12 * 60 * 60 * 1000);
    expect(await f.auth.session(next.token)).toBeNull();
    expect(await f.db.session.count()).toBe(0);
  });
  it('rejects missing credentials, missing/mismatched browser state and expired challenges', async () => {
    const a = await f.auth.begin();
    await expect(
      f.auth.finish(a.state, undefined, 'alice'),
    ).rejects.toMatchObject({ code: 'INVALID_LOGIN' });
    await expect(
      f.auth.finish(a.state, 'x'.repeat(43), 'alice'),
    ).rejects.toMatchObject({ code: 'INVALID_LOGIN' });
    await expect(f.auth.finish(a.state, a.state, '')).rejects.toMatchObject({
      code: 'INVALID_LOGIN',
    });
    f.clock.now = new Date(f.clock.now.getTime() + 5 * 60 * 1000);
    await expect(
      f.auth.finish(a.state, a.state, 'alice'),
    ).rejects.toMatchObject({ code: 'INVALID_LOGIN' });
    expect(f.provider.verify).not.toHaveBeenCalled();
    expect(await f.db.session.count()).toBe(0);
  });
  it('does not allow replay of a consumed challenge', async () => {
    const a = await f.auth.begin();
    await f.auth.finish(a.state, a.state, 'alice');
    await expect(
      f.auth.finish(a.state, a.state, 'alice'),
    ).rejects.toMatchObject({ code: 'INVALID_LOGIN' });
    expect(f.provider.verify).toHaveBeenCalledTimes(1);
  });
  it('does not create users or sessions after provider verification fails', async () => {
    await expect(f.login('invalid')).rejects.toThrow();
    expect(await f.db.user.count()).toBe(0);
    expect(await f.db.session.count()).toBe(0);
  });
  it('isolates existing profiles with an owner-constrained database query', async () => {
    const alice = await f.login();
    const bob = await f.login('bob');
    const context = (await f.auth.session(alice.token))!;
    const read = (id: string) =>
      findOwnedRecord(context, id, (where) =>
        f.auth.profile(where.id, where.userId),
      );
    expect(await read(alice.user.id)).toEqual(alice.user);
    await expect(read(bob.user.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(read('does-not-exist')).rejects.toMatchObject({ status: 404 });
  });
});
