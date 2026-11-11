import { readFileSync } from 'node:fs';
import type { safeFetch } from '../../src/modules/scanning/safe-fetch.js';
import { FIXTURE_PAGES } from './fixture-server.js';

// Memory-only fixture transport. Never resolves DNS or opens a network connection.
export const fixtureFetch: typeof safeFetch = async (input, signal) => {
  signal.throwIfAborted();
  const url = new URL(input);
  if (url.origin !== 'https://fixture.nabiz.test')
    throw new Error('FIXTURE_ONLY');
  const name = FIXTURE_PAGES[url.pathname] ?? null;
  return {
    url: url.href,
    status: name ? 200 : 404,
    headers: {
      'content-type': name ? 'text/html; charset=utf-8' : 'text/plain',
    },
    body: name
      ? readFileSync(new URL(`../fixtures/${name}.html`, import.meta.url))
      : Buffer.from('Not found'),
  };
};
