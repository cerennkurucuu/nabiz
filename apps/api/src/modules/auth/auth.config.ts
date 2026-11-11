export interface AuthConfig {
  clientId: string;
  appOrigin: string;
  secure: boolean;
  sessionSeconds: number;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const secure = env['NODE_ENV'] === 'production';
  const origin = new URL(env['APP_ORIGIN'] ?? 'http://localhost:4300');
  if (
    origin.origin !== origin.href.replace(/\/$/, '') ||
    origin.username ||
    origin.password ||
    !['http:', 'https:'].includes(origin.protocol)
  ) {
    throw new Error('APP_ORIGIN must contain only an HTTP(S) origin.');
  }
  if (secure && origin.protocol !== 'https:')
    throw new Error('APP_ORIGIN must use HTTPS in production.');
  const clientId = env['GOOGLE_CLIENT_ID']?.trim() ?? '';
  if (
    clientId &&
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)
  ) {
    throw new Error('GOOGLE_CLIENT_ID must be a Google Web client ID.');
  }
  return {
    clientId,
    appOrigin: origin.origin,
    secure,
    sessionSeconds: 12 * 60 * 60,
  };
}
