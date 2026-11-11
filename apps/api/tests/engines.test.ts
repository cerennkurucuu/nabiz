import { describe, expect, it } from 'vitest';
import { BrowserRunner } from '../src/modules/scanning/browser.runner.js';
import { fixtureServer } from './helpers/fixture-server.js';
import { summarizeChecks } from '../src/modules/scanning/checks.js';

/** Kontrol kayıtlarının kimliği kural+görünüm+adres olarak benzersizdir. */
const checkIds = (checks: { id: string }[]) => checks.map((check) => check.id);

describe('Analiz motorları (gerçek Chromium, döngüsel fixture sunucusu)', () => {
  it('sağlıklı sayfada hiçbir motor bulgu üretmez', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/healthy'],
        new AbortController().signal,
        async () => {},
      );
      expect(result.complete).toBe(true);
      expect(result.pages.flatMap((page) => page.findings)).toEqual([]);
      const totals = summarizeChecks(result.checks ?? []);
      expect(totals.failed).toBe(0);
      expect(totals.passed).toBeGreaterThan(0);
      // Motorların tamamı tamamlandı.
      expect(result.engines?.map((engine) => engine.status)).toEqual([
        'completed',
        'completed',
        'completed',
        'completed',
      ]);
      // Her başarılı sayfa için masaüstü ve mobil ekran görüntüsü üretildi.
      const captures = result.captures ?? [];
      expect(captures.filter((item) => item.kind === 'page')).toHaveLength(2);
      expect(
        captures.filter((item) => item.viewport === 'desktop'),
      ).toHaveLength(1);
      expect(
        captures.filter((item) => item.viewport === 'mobile'),
      ).toHaveLength(1);
    } finally {
      await server.close();
    }
  }, 90000);

  it('SEO eksikleri gerçek kurallarla raporlanır', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/seo-missing'],
        new AbortController().signal,
        async () => {},
      );
      const rules = new Set(
        result.pages.flatMap((page) => page.findings.map((f) => f.rule)),
      );
      // Eksik SEO alanları, HTML lang ve görsel alt metni raporlanır.
      expect(rules.has('S01')).toBe(true);
      expect(rules.has('S02')).toBe(true);
      expect(rules.has('S05')).toBe(true);
      expect(rules.has('S07')).toBe(true);
      expect(rules.has('S08')).toBe(true);
      expect(rules.has('S09')).toBe(true);
      expect(rules.has('S10')).toBe(true);
      expect(rules.has('S14')).toBe(true);
      // Kontroller geçmiş/başarısız olarak ayrılır, "çalıştırılmadı" değil.
      const seoChecks = (result.checks ?? []).filter((check) =>
        check.rule.startsWith('S'),
      );
      expect(seoChecks.length).toBeGreaterThan(0);
      expect(seoChecks.every((check) => check.viewport === 'desktop')).toBe(
        true,
      );
      expect(seoChecks.some((check) => check.status === 'failed')).toBe(true);
      expect(seoChecks.some((check) => check.status === 'passed')).toBe(true);
    } finally {
      await server.close();
    }
  }, 90000);

  it('düşük kontrast oranı, renkleri ve öğesiyle raporlanır', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/contrast-bad'],
        new AbortController().signal,
        async () => {},
      );
      const contrast = result.pages
        .flatMap((page) => page.findings)
        .filter((item) => item.rule === 'A02' || item.rule === 'A03');
      expect(contrast.length).toBeGreaterThanOrEqual(3);
      const evidence = contrast.map((item) => item.evidence).join(' ');
      // Oran, ön plan ve arka plan renkleri kanıtta yer alır.
      expect(evidence).toMatch(/\d+(\.\d+)?:1/);
      expect(evidence.toLowerCase()).toContain('foreground color');
      expect(evidence.toLowerCase()).toContain('backgr');
    } finally {
      await server.close();
    }
  }, 90000);

  it('mobil taşma ve kırılma noktası bozulması raporlanır', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/responsive-broken'],
        new AbortController().signal,
        async () => {},
      );
      const rules = new Set(
        result.pages.flatMap((page) => page.findings.map((f) => f.rule)),
      );
      expect(rules.has('U02')).toBe(true);
      expect(rules.has('U17')).toBe(true);
      const overflow = result.pages
        .flatMap((page) => page.findings)
        .find((item) => item.rule === 'U02');
      expect(overflow?.evidence).toContain('px');
      const breakpoint = result.pages
        .flatMap((page) => page.findings)
        .find((item) => item.rule === 'U17');
      expect(breakpoint?.evidence).toMatch(/\d+px genişlikte/);
    } finally {
      await server.close();
    }
  }, 90000);

  it('küçük dokunma hedefleri ve küçük yazı raporlanır', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/touch-targets'],
        new AbortController().signal,
        async () => {},
      );
      const rules = new Set(
        result.pages.flatMap((page) => page.findings.map((f) => f.rule)),
      );
      expect(rules.has('U12')).toBe(true);
      expect(rules.has('U14')).toBe(true);
      // Aynı öğe iki motor tarafından iki kez raporlanmaz (görünüm başına).
      for (const viewport of ['desktop', 'mobile']) {
        const targets = result.pages
          .filter((page) => page.viewport === viewport)
          .flatMap((page) => page.findings)
          .filter((item) => item.rule === 'U12');
        expect(new Set(targets.map((item) => item.selector)).size).toBe(
          targets.length,
        );
      }
    } finally {
      await server.close();
    }
  }, 90000);

  it('erişilebilirlik hataları axe-core ile yakalanır', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/a11y-errors'],
        new AbortController().signal,
        async () => {},
      );
      const rules = new Set(
        result.pages.flatMap((page) => page.findings.map((f) => f.rule)),
      );
      // Görsel alt metni, form etiketi, ARIA ve bağlantı/düğme isimleri.
      // Form etiketi ve isim kuralları Nabız'ın X01/U15 kurallarıyla
      // birleşir; bulgu tek yerde raporlanır.
      expect(rules.has('A06')).toBe(true);
      expect(rules.has('X01')).toBe(true);
      expect(rules.has('A05')).toBe(true);
      expect(rules.has('U15')).toBe(true);
      // Pozitif tabindex odak sırasını bozar.
      expect(rules.has('U16')).toBe(true);
      const axeChecks = (result.checks ?? []).filter((check) =>
        check.rule.startsWith('A0'),
      );
      expect(axeChecks.some((check) => check.status === 'failed')).toBe(true);
    } finally {
      await server.close();
    }
  }, 90000);

  it('kontrol kimlikleri benzersizdir', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/healthy'],
        new AbortController().signal,
        async () => {},
      );
      const ids = checkIds(result.checks ?? []);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      await server.close();
    }
  }, 90000);

  it('bir motor çalışamazken diğerleri sonuç üretir', async () => {
    const server = await fixtureServer();
    try {
      // Sayfa erişilemeyen durumda tüm DOM motorları "çalıştırılmadı" olur;
      // PageSpeed motoru ise bağımsız çalışmaya devam eder.
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/blocked'],
        new AbortController().signal,
        async () => {},
      );
      expect(result.complete).toBe(false);
      expect(result.pages.every((page) => page.access === 'blocked')).toBe(
        true,
      );
      expect(result.pages.flatMap((page) => page.findings)).toEqual([]);
      expect(
        (result.checks ?? []).every((check) => check.status === 'skipped'),
      ).toBe(true);
      expect(
        result.engines?.every((engine) => engine.status === 'blocked'),
      ).toBe(true);
    } finally {
      await server.close();
    }
  }, 90000);
});
