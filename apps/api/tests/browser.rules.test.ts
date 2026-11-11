import { describe, expect, it } from 'vitest';
import { BrowserRunner } from '../src/modules/scanning/browser.runner.js';
import { fixtureFetch } from './helpers/fixture-fetch.js';

describe('Real Chromium fixture scans (no Google account or public network)', () => {
  it('detects all seven intentional defects with screenshot evidence and both viewports', async () => {
    const result = await new BrowserRunner(fixtureFetch).run(
      ['https://fixture.nabiz.test/broken'],
      new AbortController().signal,
      async () => {},
    );
    expect(result.pages).toHaveLength(2);
    expect(result.complete).toBe(true);
    const rules = new Set(
      result.pages.flatMap((p) => p.findings.map((f) => f.rule)),
    );
    // Yedi temel kural; yeni motorların ek kuralları da üretilebilir.
    expect(
      ['T01', 'T02', 'T03', 'T04', 'U02', 'U04', 'X01'].every((rule) =>
        rules.has(rule),
      ),
    ).toBe(true);
    // Ekran görüntüleri JSON'a gömülmez; dosya deposuna yazılacak şekilde
    // üretilir (masaüstü ve mobil).
    const pageShots = (result.captures ?? []).filter(
      (item) => item.kind === 'page',
    );
    expect(pageShots).toHaveLength(2);
    expect(pageShots.map((item) => item.viewport).sort()).toEqual([
      'desktop',
      'mobile',
    ]);
    expect(result.pages[0]!.findings.some((f) => f.rule === 'U02')).toBe(false);
    expect(result.pages[1]!.findings.some((f) => f.rule === 'U02')).toBe(true);
  }, 60000);
  it('does not flag healthy images, links, labels or intentional button variants', async () => {
    const result = await new BrowserRunner(fixtureFetch).run(
      ['https://fixture.nabiz.test/healthy'],
      new AbortController().signal,
      async () => {},
    );
    expect(result.complete).toBe(true);
    expect(result.pages.flatMap((p) => p.findings)).toEqual([]);
  }, 60000);
  it('reports network-blocked pages as incomplete instead of healthy', async () => {
    const result = await new BrowserRunner(async () => {
      throw new Error('blocked');
    }).run(
      ['https://fixture.nabiz.test/blocked'],
      new AbortController().signal,
      async () => {},
    );
    expect(result.complete).toBe(false);
    expect(
      result.pages.every((p) =>
        p.findings.every((f) => f.status === 'uncertain'),
      ),
    ).toBe(true);
  }, 60000);
  it('honors cancellation without opening a browser', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new BrowserRunner(fixtureFetch).run(
        ['https://fixture.nabiz.test/healthy'],
        controller.signal,
        async () => {},
      ),
    ).rejects.toThrow();
  });
});
