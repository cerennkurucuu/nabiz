import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserRunner } from '../src/modules/scanning/browser.runner.js';
import { fixtureServer } from './helpers/fixture-server.js';

interface FindingView {
  rule: string;
  status: 'confirmed' | 'uncertain';
  evidence: string;
}
interface PageView {
  url: string;
  viewport: string;
  complete: boolean;
  access?: string;
  error?: string;
  statusMessage?: string;
  findings: FindingView[];
}

const scan = async (
  fetcher: Awaited<ReturnType<typeof fixtureServer>>['fetcher'],
  path: string,
) => {
  const result = await new BrowserRunner(fetcher).run(
    [`https://fixture.nabiz.test${path}`],
    new AbortController().signal,
    async () => {},
  );
  return result.pages as PageView[];
};

describe('Access states in real Chromium scans', () => {
  let server: Awaited<ReturnType<typeof fixtureServer>>;
  beforeAll(async () => {
    server = await fixtureServer();
  });
  afterAll(async () => {
    await server.close();
  });

  it('reports a 403 main document as blocked, not as a quality defect', async () => {
    const pages = await scan(server.fetcher, '/blocked');
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(page.complete).toBe(false);
      expect(page.access).toBe('blocked');
      expect(page.error).toBe('BOT_PROTECTION');
      expect(page.statusMessage).toContain('değerlendirilmedi');
      // No confirmed finding may be produced for a page we could not read.
      expect(page.findings).toEqual([]);
    }
  }, 60000);

  it('reports a captcha answer as bot protection', async () => {
    const pages = await scan(server.fetcher, '/captcha');
    for (const page of pages) {
      expect(page.complete).toBe(false);
      expect(page.access).toBe('blocked');
      expect(page.error).toBe('BOT_PROTECTION');
      expect(page.findings).toEqual([]);
    }
  }, 60000);

  it('reports an authentication answer separately', async () => {
    const pages = await scan(server.fetcher, '/unauthorized');
    for (const page of pages) {
      expect(page.complete).toBe(false);
      expect(page.access).toBe('blocked');
      expect(page.error).toBe('AUTH_REQUIRED');
      expect(page.findings).toEqual([]);
    }
  }, 60000);

  it('reports a server error as unavailable content', async () => {
    const pages = await scan(server.fetcher, '/server-error');
    for (const page of pages) {
      expect(page.complete).toBe(false);
      expect(page.access).toBe('unavailable');
      expect(page.error).toBe('SERVER_ERROR');
      expect(page.findings).toEqual([]);
    }
  }, 60000);

  it('reports a protection page that answers with 200 as blocked', async () => {
    const pages = await scan(server.fetcher, '/challenge');
    for (const page of pages) {
      expect(page.complete).toBe(false);
      expect(page.access).toBe('blocked');
      expect(page.error).toBe('BOT_PROTECTION');
      expect(page.findings).toEqual([]);
    }
  }, 60000);

  it('separates broken sub-resources from blocked ones', async () => {
    const pages = await scan(server.fetcher, '/mixed');
    for (const page of pages) {
      expect(page.complete).toBe(true);
      expect(page.access).toBe('ok');
      const missing = page.findings.filter((item) =>
        item.evidence.includes('/missing.png'),
      );
      // A missing file is a confirmed defect of the page.
      expect(missing.some((item) => item.status === 'confirmed')).toBe(true);
      // A blocked resource may be a protection layer, so it stays uncertain.
      const blocked = page.findings.filter(
        (item) =>
          item.rule === 'T02' && item.evidence.includes('/forbidden.png'),
      );
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked.every((item) => item.status === 'uncertain')).toBe(true);
      // A refused image is not reported as a broken file either.
      const refusedImage = page.findings.filter(
        (item) =>
          item.rule === 'T04' && item.evidence.includes('/forbidden.png'),
      );
      expect(refusedImage.every((item) => item.status === 'uncertain')).toBe(
        true,
      );
    }
  }, 60000);

  it('marks the scan result as incomplete when a view could not be analyzed', async () => {
    const result = await new BrowserRunner(server.fetcher).run(
      ['https://fixture.nabiz.test/blocked'],
      new AbortController().signal,
      async () => {},
    );
    expect(result.complete).toBe(false);
    expect(result.pages.every((page) => page.complete === false)).toBe(true);
  }, 60000);
});
