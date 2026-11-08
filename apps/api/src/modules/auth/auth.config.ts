export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  redirectUri: string;
  secure: boolean;
  sessionSeconds: number;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const secure = env['NODE_ENV'] === 'production';
  const origin = new URL(env['APP_ORIGIN'] ?? 'http://127.0.0.1:4300');
  if (
    origin.origin !== origin.href.replace(/\/$/, '') ||
    origin.username ||
    origin.password
  ) {
    throw new Error('APP_ORIGIN must contain only an origin.');
  }
  if (secure && origin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTPS in production.');
  }
  if (!['http:', 'https:'].includes(origin.protocol))
    throw new Error('Invalid APP_ORIGIN.');
  const redirect = new URL(
    env['GOOGLE_REDIRECT_URI'] ?? `${origin.origin}/api/auth/google/callback`,
  );
  if (
    redirect.origin !== origin.origin ||
    redirect.pathname !== '/api/auth/google/callback' ||
    redirect.search ||
    redirect.hash
  ) {
    throw new Error(
      'GOOGLE_REDIRECT_URI must be the same-origin /api/auth/google/callback URL.',
    );
  }
  const clientId = env['GOOGLE_CLIENT_ID']?.trim() ?? '';
  const clientSecret = env['GOOGLE_CLIENT_SECRET']?.trim() ?? '';
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  return {
    clientId,
    clientSecret,
    appOrigin: origin.origin,
    redirectUri: redirect.href,
    secure,
    sessionSeconds: 12 * 60 * 60,
  };
}
