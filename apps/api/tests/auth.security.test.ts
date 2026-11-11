import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { loadAuthConfig } from '../src/modules/auth/auth.config.js';
import {
  clearTokenCookie,
  cookieName,
  readTokenCookie,
  setTokenCookie,
} from '../src/modules/auth/auth.security.js';
import { requireSameOrigin } from '../src/modules/auth/auth.routes.js';

describe('Auth configuration and cookie boundaries', () => {
  it('requires only a client id and fails closed for invalid configuration', () => {
    expect(loadAuthConfig({}).clientId).toBe('');
    expect(
      loadAuthConfig({ GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' })
        .clientId,
    ).toBe('test.apps.googleusercontent.com');
    for (const APP_ORIGIN of [
      'https://example.test/path',
      'https://user:pass@example.test',
      'https://example.test/?a=b',
      'javascript:alert(1)',
    ])
      expect(() => loadAuthConfig({ APP_ORIGIN })).toThrow();
    expect(() => loadAuthConfig({ NODE_ENV: 'production' })).toThrow('HTTPS');
    expect(() => loadAuthConfig({ GOOGLE_CLIENT_ID: 'made-up' })).toThrow(
      'Web client ID',
    );
  });
  it('sets host-only Secure HttpOnly SameSite cookies in production', () => {
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const res = { cookie, clearCookie } as unknown as Response;
    const name = cookieName('session', true);
    expect(name).toBe('__Host-nabiz-session');
    setTokenCookie(res, name, 'opaque', true, 60);
    expect(cookie).toHaveBeenCalledWith(name, 'opaque', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60000,
    });
    clearTokenCookie(res, name, true);
    expect(clearCookie).toHaveBeenCalledWith(name, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
  it('rejects duplicate and malformed session cookies', () => {
    const token = 'x'.repeat(43);
    const read = (cookie?: string) =>
      readTokenCookie({ headers: { cookie } } as Request, 'nabiz-session');
    expect(read(`nabiz-session=${token}`)).toBe(token);
    expect(
      read(`nabiz-session=${token}; nabiz-session=${token}`),
    ).toBeUndefined();
    expect(read('nabiz-session=%bad')).toBeUndefined();
    expect(read()).toBeUndefined();
  });
  it('requires exact Origin, JSON and a same-site request for login', () => {
    const middleware = requireSameOrigin('https://example.test');
    for (const [origin, site, json] of [
      ['https://attacker.test', 'same-origin', true],
      [undefined, undefined, true],
      ['https://example.test', 'cross-site', true],
      ['https://example.test', 'same-origin', false],
    ]) {
      const req = {
        get: (name: string) => (name === 'Origin' ? origin : site),
        is: () => json,
      } as unknown as Request;
      expect(() => middleware(req, {} as Response, vi.fn())).toThrow();
    }
    const next = vi.fn();
    middleware(
      {
        get: (name: string) =>
          name === 'Origin' ? 'https://example.test' : 'same-origin',
        is: () => 'application/json',
      } as unknown as Request,
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
