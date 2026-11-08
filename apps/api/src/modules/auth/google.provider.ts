import {
  createHash,
  createPublicKey,
  verify,
  type JsonWebKey,
} from 'node:crypto';
import { AuthError, equalTokens } from './auth.security.js';
import type { AuthConfig } from './auth.config.js';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}
export interface IdentityProvider {
  authorizationUrl(state: string, nonce: string, verifier: string): string;
  exchange(
    code: string,
    verifier: string,
    nonce: string,
  ): Promise<GoogleIdentity>;
}

const invalidIdentity = () =>
  new AuthError(401, 'INVALID_IDENTITY', 'Google kimliği doğrulanamadı.');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidIdentity();
  return value as Record<string, unknown>;
}

// Google OIDC: signature, exact audience/issuer, expiry and per-login nonce.
// Keys come only from Google's fixed HTTPS JWKS endpoint, never from a JWT URL.
export function verifyGoogleIdToken(
  token: string,
  keys: JsonWebKey[],
  clientId: string,
  nonce: string,
  now = Date.now(),
): GoogleIdentity {
  if (token.length > 16384) throw invalidIdentity();
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((x) => !/^[A-Za-z0-9_-]+$/.test(x)))
    throw invalidIdentity();
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = object(
      JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')),
    );
    claims = object(
      JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')),
    );
  } catch {
    throw invalidIdentity();
  }
  if (
    header['alg'] !== 'RS256' ||
    typeof header['kid'] !== 'string' ||
    header['crit'] !== undefined
  )
    throw invalidIdentity();
  const jwk = keys.find(
    (key) =>
      key['kid'] === header['kid'] &&
      key.kty === 'RSA' &&
      (!key['alg'] || key['alg'] === 'RS256') &&
      (!key['use'] || key['use'] === 'sig'),
  );
  if (!jwk) throw invalidIdentity();
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    if (
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
      !verify(
        'RSA-SHA256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        key,
        Buffer.from(signaturePart, 'base64url'),
      )
    )
      throw invalidIdentity();
  } catch {
    throw invalidIdentity();
  }
  const seconds = Math.floor(now / 1000);
  if (
    !['https://accounts.google.com', 'accounts.google.com'].includes(
      String(claims['iss']),
    ) ||
    claims['aud'] !== clientId ||
    (claims['azp'] !== undefined && claims['azp'] !== clientId) ||
    typeof claims['exp'] !== 'number' ||
    !Number.isFinite(claims['exp']) ||
    claims['exp'] <= seconds ||
    typeof claims['iat'] !== 'number' ||
    !Number.isFinite(claims['iat']) ||
    claims['iat'] > seconds + 60 ||
    (claims['nbf'] !== undefined &&
      (typeof claims['nbf'] !== 'number' || claims['nbf'] > seconds)) ||
    typeof claims['nonce'] !== 'string' ||
    !equalTokens(claims['nonce'], nonce) ||
    typeof claims['sub'] !== 'string' ||
    !claims['sub'] ||
    claims['sub'].length > 255 ||
    claims['email_verified'] !== true ||
    typeof claims['email'] !== 'string' ||
    claims['email'].length > 320
  )
    throw invalidIdentity();
  return {
    sub: claims['sub'],
    email: claims['email'],
    name:
      typeof claims['name'] === 'string'
        ? claims['name'].slice(0, 200)
        : claims['email'],
  };
}

export class GoogleProvider implements IdentityProvider {
  private keys: JsonWebKey[] = [];
  private keysUntil = 0;
  constructor(
    private readonly config: AuthConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  authorizationUrl(state: string, nonce: string, verifier: string) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return url.href;
  }

  async exchange(code: string, verifier: string, nonce: string) {
    try {
      const response = await this.fetcher(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uri: this.config.redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier,
          }),
        },
      );
      if (!response.ok) throw invalidIdentity();
      const tokens = object(await response.json());
      if (typeof tokens['id_token'] !== 'string') throw invalidIdentity();
      if (Date.now() >= this.keysUntil) {
        const result = await this.fetcher(
          'https://www.googleapis.com/oauth2/v3/certs',
          { redirect: 'error', signal: AbortSignal.timeout(10000) },
        );
        if (!result.ok) throw invalidIdentity();
        const body = object(await result.json());
        if (!Array.isArray(body['keys'])) throw invalidIdentity();
        this.keys = body['keys'].map((k) => object(k) as JsonWebKey);
        this.keysUntil = Date.now() + 5 * 60 * 1000;
      }
      return verifyGoogleIdToken(
        tokens['id_token'],
        this.keys,
        this.config.clientId,
        nonce,
      );
    } catch {
      throw invalidIdentity();
    }
  }
}
