import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { safeFetch } from '../../src/modules/scanning/safe-fetch.js';

// The scan target host stays inside the public URL policy; the bytes are served
// by a loopback HTTP server so no public network and no DNS is used.
export const FIXTURE_ORIGIN = 'https://fixture.nabiz.test';

/** Her senaryo için ayrı bir fixture sayfası. */
export const FIXTURE_PAGES: Record<string, string> = {
  '/healthy': 'healthy',
  '/broken': 'broken',
  '/seo-missing': 'seo-missing',
  '/contrast-bad': 'contrast-bad',
  '/responsive-broken': 'responsive-broken',
  '/touch-targets': 'touch-targets',
  '/a11y-errors': 'a11y-errors',
};

const protectionBody = `<!doctype html>
<html lang="tr"><head><title>Attention Required! | Cloudflare</title></head>
<body><h1>Attention Required! | Cloudflare</h1>
<p>Sorry, you have been blocked. Enable JavaScript and cookies to continue.</p>
<div id="cf-chl-widget-1"></div></body></html>`;

const captchaBody = `<!doctype html>
<html lang="tr"><head><title>Doğrulama</title></head>
<body><h1>Please verify you are a human</h1>
<form action="/captcha"><div class="g-recaptcha" data-sitekey="x"></div></form></body></html>`;

const challengeBody = `<!doctype html>
<html lang="tr"><head><title>Bekleyin</title></head>
<body><h1>Just a moment...</h1><div id="cf-chl-widget-2"></div></body></html>`;

const mixedBody = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" /><title>Alt kaynak durumları</title></head>
<body><h1>Alt kaynak durumları</h1>
<img alt="Eksik" src="/missing.png" />
<img alt="Engelli" src="/forbidden.png" />
<a href="/healthy">Sağlıklı sayfa</a></body></html>`;

export async function fixtureServer() {
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const fixture = FIXTURE_PAGES[path];
    if (fixture) {
      const body = readFileSync(
        new URL(`../fixtures/${fixture}.html`, import.meta.url),
      );
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
    if (path === '/blocked') {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      res.end(protectionBody);
      return;
    }
    if (path === '/captcha') {
      res.writeHead(429, { 'content-type': 'text/html; charset=utf-8' });
      res.end(captchaBody);
      return;
    }
    if (path === '/unauthorized') {
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><p>Yetki gerekli.</p>');
      return;
    }
    if (path === '/server-error') {
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><p>Sunucu hatası.</p>');
      return;
    }
    if (path === '/challenge') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(challengeBody);
      return;
    }
    if (path === '/mixed') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(mixedBody);
      return;
    }
    if (path === '/forbidden.png') {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  const fetcher: typeof safeFetch = async (input, signal, budget) => {
    signal.throwIfAborted();
    if (++budget.requests > 150) throw new Error('REQUEST_LIMIT');
    const url = new URL(input);
    if (url.origin !== FIXTURE_ORIGIN) throw new Error('FIXTURE_ONLY');
    const response = await fetch(`${origin}${url.pathname}${url.search}`, {
      signal,
      redirect: 'manual',
    });
    const body = Buffer.from(await response.arrayBuffer());
    budget.bytes += body.length;
    if (budget.bytes > 10 * 1024 * 1024) throw new Error('TRANSFER_LIMIT');
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { url: url.href, status: response.status, headers, body };
  };
  return {
    origin,
    fetcher,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
