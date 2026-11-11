import { OAuth2Client } from 'google-auth-library';
import { AuthError, equalTokens } from './auth.security.js';
import type { AuthConfig } from './auth.config.js';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}
export interface IdentityProvider {
  verify(credential: string, nonce: string): Promise<GoogleIdentity>;
}

// Official Google verifier handles signature, rotating keys, issuer, audience
// and token lifetime. Never accept keys or issuer URLs from the browser.
export class GoogleProvider implements IdentityProvider {
  constructor(
    private readonly config: AuthConfig,
    private readonly client = new OAuth2Client({
      transporterOptions: { timeout: 10000 },
    }),
  ) {}

  async verify(credential: string, nonce: string): Promise<GoogleIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.config.clientId,
      });
      const claims = ticket.getPayload();
      const seconds = Math.floor(Date.now() / 1000);
      // Strict expiry and per-login nonce supplement the library's clock tolerance.
      if (
        !claims ||
        !claims.sub ||
        claims.sub.length > 255 ||
        claims.aud !== this.config.clientId ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(
          claims.iss,
        ) ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= seconds ||
        !Number.isFinite(claims.iat) ||
        claims.iat > seconds + 60 ||
        (claims.azp !== undefined && claims.azp !== this.config.clientId) ||
        typeof claims['nonce'] !== 'string' ||
        !equalTokens(claims['nonce'], nonce) ||
        claims.email_verified !== true ||
        !claims.email ||
        claims.email.length > 320
      ) {
        throw new Error('Invalid identity');
      }
      return {
        sub: claims.sub,
        email: claims.email,
        name: (claims.name || claims.email).slice(0, 200),
      };
    } catch {
      // Never return or log credentials or raw provider errors.
      throw new AuthError(
        401,
        'INVALID_IDENTITY',
        'Google kimliği doğrulanamadı.',
      );
    }
  }
}
