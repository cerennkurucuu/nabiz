import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const randomToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const csrfToken = (token: string) => hashToken(`nabiz-csrf:${token}`);

export function equalTokens(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cookieName(kind: 'session' | 'oauth', secure: boolean) {
  return `${secure ? '__Host-' : ''}nabiz-${kind}`;
}

// Only our opaque base64url cookies are accepted. Duplicate names fail closed.
export function readTokenCookie(
  req: Request,
  name: string,
): string | undefined {
  const matches = (req.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const token = matches[0]?.slice(name.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function setTokenCookie(
  res: Response,
  name: string,
  token: string,
  secure: boolean,
  seconds: number,
) {
  res.cookie(name, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: seconds * 1000,
  });
}

export function clearTokenCookie(res: Response, name: string, secure: boolean) {
  res.clearCookie(name, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
}
