import { fileURLToPath } from 'node:url';

// Windows sandbox home directories can change between invocations. Keep browser
// binaries in the ignored project cache used by npm run browser:install.
process.env['PLAYWRIGHT_BROWSERS_PATH'] ||= fileURLToPath(
  new URL('../../../../../.cache/ms-playwright', import.meta.url),
);
export const { chromium } = await import('playwright');
