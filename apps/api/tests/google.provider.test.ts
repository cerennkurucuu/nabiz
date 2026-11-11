import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleProvider } from '../src/modules/auth/google.provider.js';
import { loadAuthConfig } from '../src/modules/auth/auth.config.js';

const config = loadAuthConfig({
  GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
});
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const client = new OAuth2Client();
vi.spyOn(client, 'getFederatedSignonCertsAsync').mockResolvedValue({
  certs: {
    'local-key': pair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
  },
  format: 'PEM',
} as Awaited<ReturnType<typeof client.getFederatedSignonCertsAsync>>);
const verification = vi.spyOn(client, 'verifyIdToken');
const provider = new GoogleProvider(config, client);
function token(overrides: Record<string, unknown> = {}, wrongKey = false) {
  const seconds = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'local-key' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: config.clientId,
      iat: seconds,
      exp: seconds + 3600,
      sub: 'google-user',
      email: 'test@example.test',
      email_verified: true,
      name: 'Test',
      nonce: 'browser-nonce',
      ...overrides,
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const key = wrongKey
    ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    : pair.privateKey;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}
beforeEach(() => {
  verification.mockClear();
});
describe('Official Google ID token verification with local test keys', () => {
  it('accepts a signed valid ID token through verifyIdToken', async () => {
    const credential = token();
    expect(await provider.verify(credential, 'browser-nonce')).toEqual({
      sub: 'google-user',
      email: 'test@example.test',
      name: 'Test',
    });
    expect(verification).toHaveBeenCalledWith({
      idToken: credential,
      audience: config.clientId,
    });
  });
  it.each([
    ['wrong audience', { aud: 'attacker.apps.googleusercontent.com' }],
    ['missing audience', { aud: undefined }],
    ['wrong issuer', { iss: 'https://attacker.test' }],
    [
      'expired within SDK tolerance',
      { exp: Math.floor(Date.now() / 1000) - 1 },
    ],
    [
      'expired well beyond tolerance',
      { exp: Math.floor(Date.now() / 1000) - 3600 },
    ],
    ['missing expiry', { exp: undefined }],
    ['missing issued-at', { iat: undefined }],
    ['future issued-at', { iat: Math.floor(Date.now() / 1000) + 600 }],
    ['wrong nonce', { nonce: 'attacker' }],
    ['missing nonce', { nonce: undefined }],
    ['unverified email', { email_verified: false }],
    ['missing subject', { sub: undefined }],
    ['wrong authorized party', { azp: 'attacker' }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(
      provider.verify(token(overrides), 'browser-nonce'),
    ).rejects.toMatchObject({ code: 'INVALID_IDENTITY', status: 401 });
  });
  it('rejects a forged signature', async () => {
    await expect(
      provider.verify(token({}, true), 'browser-nonce'),
    ).rejects.toMatchObject({ code: 'INVALID_IDENTITY' });
  });
  it.each(['', 'not-a-token', 'e30.e30.invalid'])(
    'rejects malformed credential %s',
    async (credential) => {
      await expect(
        provider.verify(credential, 'browser-nonce'),
      ).rejects.toMatchObject({ code: 'INVALID_IDENTITY' });
    },
  );
  it('sanitizes provider failures', async () => {
    verification.mockRejectedValueOnce(
      new Error('private credential and provider details'),
    );
    await expect(
      provider.verify('private-token', 'browser-nonce'),
    ).rejects.toMatchObject({ message: 'Google kimliği doğrulanamadı.' });
  });
});
