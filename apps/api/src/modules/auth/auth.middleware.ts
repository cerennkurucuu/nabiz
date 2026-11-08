import type { RequestHandler, Response } from 'express';
import type { AuthService, SessionContext } from './auth.service.js';
import {
  AuthError,
  clearTokenCookie,
  cookieName,
  equalTokens,
  readTokenCookie,
} from './auth.security.js';

export function currentSession(res: Response): SessionContext {
  const context = res.locals['session'] as SessionContext | undefined;
  if (!context)
    throw new AuthError(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  return context;
}

export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    const name = cookieName('session', auth.config.secure);
    const session = await auth.session(readTokenCookie(req, name));
    if (!session) {
      clearTokenCookie(res, name, auth.config.secure);
      throw new AuthError(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
    }
    res.locals['session'] = session;
    next();
  };
}

export function requireCsrf(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const session = currentSession(res);
    const token = req.get('X-CSRF-Token');
    const origin = req.get('Origin');
    if (
      origin !== auth.config.appOrigin ||
      !token ||
      !equalTokens(token, session.csrfToken) ||
      req.get('Sec-Fetch-Site') === 'cross-site'
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

// Future scan/report repositories must query both record id AND server session user id.
// No userId from request bodies, query parameters or route parameters is trusted.
export async function findOwnedRecord<T>(
  context: SessionContext,
  id: string,
  find: (where: { id: string; userId: string }) => Promise<T | null>,
): Promise<T> {
  const record = await find({ id, userId: context.user.id });
  if (!record) throw new AuthError(404, 'NOT_FOUND', 'Kaynak bulunamadı.');
  return record;
}
