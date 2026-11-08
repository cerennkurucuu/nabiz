import { Router, type RequestHandler } from 'express';
import type {
  ApiResponse,
  AuthSession,
} from '../../../../../packages/contracts/api.js';
import type { AuthService } from './auth.service.js';
import { currentSession, requireAuth, requireCsrf } from './auth.middleware.js';
import {
  AuthError,
  clearTokenCookie,
  cookieName,
  readTokenCookie,
  setTokenCookie,
} from './auth.security.js';

// Bounded memory; do not trust arbitrary X-Forwarded-For headers for limiter identity.
function loginLimiter(): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of entries)
      if (value.until <= now) entries.delete(key);
    const key = req.ip ?? 'unknown';
    const entry = entries.get(key) ?? { count: 0, until: now + 10 * 60 * 1000 };
    if (entry.count >= 60 || (!entries.has(key) && entries.size >= 10000)) {
      res.setHeader('Retry-After', '600');
      throw new AuthError(
        429,
        'LOGIN_RATE_LIMITED',
        'Çok fazla giriş denemesi. Biraz sonra tekrar deneyin.',
      );
    }
    entry.count++;
    entries.set(key, entry);
    next();
  };
}

export function authRouter(auth: AuthService) {
  const router = Router();
  const secure = auth.config.secure;
  const sessionCookie = cookieName('session', secure);
  const stateCookie = cookieName('oauth', secure);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.get('/session', async (req, res) => {
    const session = await auth.session(readTokenCookie(req, sessionCookie));
    if (!session) clearTokenCookie(res, sessionCookie, secure);
    const data: AuthSession = session
      ? {
          configured: auth.configured,
          user: session.user,
          csrfToken: session.csrfToken,
        }
      : { configured: auth.configured, user: null, csrfToken: null };
    res.json({ data } satisfies ApiResponse<AuthSession>);
  });
  router.get('/google', loginLimiter(), async (_req, res) => {
    const attempt = await auth.begin();
    setTokenCookie(res, stateCookie, attempt.state, secure, 5 * 60);
    res.redirect(attempt.url);
  });
  router.get('/google/callback', async (req, res) => {
    const state =
      typeof req.query['state'] === 'string' ? req.query['state'] : '';
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
    const browserState = readTokenCookie(req, stateCookie);
    clearTokenCookie(res, stateCookie, secure);
    try {
      const result = await auth.finish(
        state,
        browserState,
        code,
        readTokenCookie(req, sessionCookie),
      );
      setTokenCookie(
        res,
        sessionCookie,
        result.token,
        secure,
        auth.config.sessionSeconds,
      );
      res.redirect(303, `${auth.config.appOrigin}/`);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      // No provider token, authorization code or raw error is reflected in the URL.
      res.redirect(303, `${auth.config.appOrigin}/?auth=failed`);
    }
  });
  router.post(
    '/logout',
    requireAuth(auth),
    requireCsrf(auth),
    async (_req, res) => {
      await auth.logout(currentSession(res));
      clearTokenCookie(res, sessionCookie, secure);
      res.status(204).end();
    },
  );
  router.get('/me', requireAuth(auth), (_req, res) => {
    res.json({ data: currentSession(res).user });
  });
  return router;
}
