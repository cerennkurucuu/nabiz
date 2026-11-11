import { describe, expect, it } from 'vitest';
import { BrowserRunner } from '../src/modules/scanning/browser.runner.js';
import { fixtureServer } from './helpers/fixture-server.js';
import { summarizeChecks } from '../src/modules/scanning/checks.js';

describe('Analiz kontrol sonuçları', () => {
  it('hatalı fixture sayfasında gerçek bulgular ve sorunlu kontroller üretir', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/broken'],
        new AbortController().signal,
        async () => {},
      );
      const checks = result.checks ?? [];
      expect(checks.length).toBeGreaterThan(14);
      expect(checks.every((check) => check.viewport)).toBe(true);
      expect(checks.every((check) => check.checkedAt)).toBe(true);

      const totals = summarizeChecks(checks);
      expect(totals.total).toBe(checks.length);
      expect(totals.failed).toBeGreaterThan(0);
      expect(totals.skipped).toBeGreaterThan(0);

      const broken = checks.filter((check) => check.status === 'failed');
      expect(broken.map((check) => check.rule)).toEqual(
        expect.arrayContaining(['T01', 'T02', 'T04', 'X01', 'U04']),
      );
      // Sorunlu kontrollerde kanıt bulunmalı.
      expect(
        broken.every((check) => Boolean(check.evidence || check.measurement)),
      ).toBe(true);
      // Masaüstünde yatay taşma kuralı çalıştırılmaz, atlanır.
      const overflowDesktop = checks.find(
        (check) => check.rule === 'U02' && check.viewport === 'desktop',
      );
      expect(overflowDesktop?.status).toBe('skipped');
      expect(overflowDesktop?.reason).toBeTruthy();
      // Mobilde yatay taşma gerçekten bulunmalı.
      const overflowMobile = checks.find(
        (check) => check.rule === 'U02' && check.viewport === 'mobile',
      );
      expect(overflowMobile?.status).toBe('failed');
      // Kontrol kimlikleri benzersizdir.
      const ids = checks.map((check) => check.id);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      await server.close();
    }
  }, 90000);

  it('sağlıklı fixture sayfasında kontroller geçer, bulgu üretilmez', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/healthy'],
        new AbortController().signal,
        async () => {},
      );
      const checks = result.checks ?? [];
      const totals = summarizeChecks(checks);
      expect(totals.failed).toBe(0);
      expect(totals.passed).toBeGreaterThan(0);
      // Uygulanmayan kurallar "geçti" değil "çalıştırılmadı" olarak işaretlenir.
      expect(totals.skipped).toBeGreaterThan(0);
      const label = checks.find((check) => check.rule === 'X01');
      expect(label?.status).toBe('passed');
      expect(label?.measurement).toContain('alan incelendi');
      expect(result.pages.every((page) => page.findings.length === 0)).toBe(
        true,
      );
    } finally {
      await server.close();
    }
  }, 90000);

  it('erişim engelinde kontroller çalıştırılmamış olarak işaretlenir', async () => {
    const server = await fixtureServer();
    try {
      const result = await new BrowserRunner(server.fetcher).run(
        ['https://fixture.nabiz.test/blocked'],
        new AbortController().signal,
        async () => {},
      );
      const checks = result.checks ?? [];
      expect(checks.length).toBeGreaterThan(0);
      expect(checks.every((check) => check.status === 'skipped')).toBe(true);
      expect(
        checks.every((check) => Boolean(check.reason && check.message)),
      ).toBe(true);
      expect(summarizeChecks(checks).passed).toBe(0);
    } finally {
      await server.close();
    }
  }, 90000);
});
