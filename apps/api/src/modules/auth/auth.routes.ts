import { Router, type RequestHandler } from 'express';
import type {
  ApiResponse,
  AuthSession,
  GoogleLoginChallenge,
} from '../../../../../packages/contracts/api.js';
import type { AuthService } from './auth.service.js';
import {
  currentSession,
  findOwnedRecord,
  requireAuth,
  requireCsrf,
} from './auth.middleware.js';
import {
  AuthError,
  clearTokenCookie,
  cookieName,
  readTokenCookie,
  setTokenCookie,
} from './auth.security.js';

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

export function requireSameOrigin(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (
      req.get('Origin') !== origin ||
      req.get('Sec-Fetch-Site') === 'cross-site' ||
      !req.is('application/json')
    ) {
      throw new AuthError(
        403,
        'CSRF_REJECTED',
        'İstek güvenlik kontrolünden geçemedi.',
      );
    }
    next();
  };
}

export function authRouter(auth: AuthService) {
  const router = Router();
  const secure = auth.config.secure;
  const sessionCookie = cookieName('session', secure);
  const stateCookie = cookieName('oauth', secure);
  const sameOrigin = requireSameOrigin(auth.config.appOrigin);
  const limiter = loginLimiter();
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
  router.post('/google/challenge', sameOrigin, limiter, async (_req, res) => {
    const challenge = await auth.begin();
    setTokenCookie(res, stateCookie, challenge.state, secure, 5 * 60);
    res.json({ data: challenge } satisfies ApiResponse<GoogleLoginChallenge>);
  });
  router.post('/google', sameOrigin, limiter, async (req, res) => {
    const state = typeof req.body?.state === 'string' ? req.body.state : '';
    const credential =
      typeof req.body?.credential === 'string' ? req.body.credential : '';
    const browserState = readTokenCookie(req, stateCookie);
    clearTokenCookie(res, stateCookie, secure);
    const result = await auth.finish(
      state,
      browserState,
      credential,
      readTokenCookie(req, sessionCookie),
    );
    setTokenCookie(
      res,
      sessionCookie,
      result.token,
      secure,
      auth.config.sessionSeconds,
    );
    res.json({
      data: {
        configured: auth.configured,
        user: result.user,
        csrfToken: (await auth.session(result.token))!.csrfToken,
      },
    } satisfies ApiResponse<AuthSession>);
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
  // Existing user profiles are the isolated resource example; no scan domain is added.
  router.get('/profiles/:id', requireAuth(auth), async (req, res) => {
    const profile = await findOwnedRecord(
      currentSession(res),
      String(req.params['id']),
      ({ id, userId }) => auth.profile(id, userId),
    );
    res.json({ data: profile });
  });
  return router;
}
