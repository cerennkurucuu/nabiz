import { describe, expect, it } from 'vitest';
import {
  emptyFilters,
  filterFindings,
  groupChecks,
  groupFindings,
  hasCheckResults,
  pageSpeedErrorLabel,
  pageSpeedStrategyLabel,
  parseScanUrls,
  sortChecks,
  summarizeChecks,
  summarizeFindings,
  summarizeScan,
} from '../src/app/core/scans/scan.report';
import type {
  ScanCheck,
  ScanFinding,
  ScanJob,
} from '../../packages/contracts/api';

const finding = (overrides: Partial<ScanFinding>): ScanFinding => ({
  id: 'f1',
  rule: 'T01',
  category: 'technical',
  severity: 'error',
  confidence: 'high',
  url: 'https://example.com',
  selector: '',
  message: 'JavaScript çalışma zamanı hatası',
  suggestion: 'Hata kaynağını inceleyin.',
  evidence: 'boom',
  status: 'confirmed',
  ...overrides,
});

describe('parseScanUrls', () => {
  it('accepts one to three http(s) addresses', () => {
    expect(parseScanUrls('https://example.com').urls).toEqual([
      'https://example.com',
    ]);
    expect(
      parseScanUrls('https://a.test\nhttp://b.test\nhttps://c.test').urls,
    ).toHaveLength(3);
  });
  it('rejects an empty list', () => {
    expect(parseScanUrls('   \n  ').error).toContain('En az bir adres');
  });
  it('rejects more than three addresses', () => {
    const input = ['a', 'b', 'c', 'd']
      .map((n) => `https://${n}.test`)
      .join('\n');
    expect(parseScanUrls(input).error).toContain('en fazla 3');
  });
  it('rejects a malformed address', () => {
    expect(parseScanUrls('example.com').error).toContain('geçerli bir adres');
  });
  it('rejects a non http scheme', () => {
    expect(parseScanUrls('ftp://example.com').error).toContain(
      'http:// veya https://',
    );
  });
  it('rejects the same address twice', () => {
    expect(
      parseScanUrls('https://example.com\nhttps://example.com/').error,
    ).toContain('birden fazla kez');
  });
});

describe('filterFindings', () => {
  const findings = [
    finding({
      id: 'a',
      severity: 'error',
      category: 'technical',
      rule: 'T01',
      message: 'JavaScript çalışma zamanı hatası',
    }),
    finding({
      id: 'b',
      severity: 'warning',
      category: 'ui',
      rule: 'U02',
      message: 'Mobil yatay taşma',
    }),
    finding({
      id: 'c',
      severity: 'info',
      category: 'ux',
      rule: 'X01',
      message: 'Form alanının erişilebilir etiketi eksik',
    }),
  ];
  it('filters by severity, category, rule and text', () => {
    expect(
      filterFindings(findings, { ...emptyFilters(), severity: 'error' }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { ...emptyFilters(), category: 'ui' }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { ...emptyFilters(), rule: 'T01' }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { ...emptyFilters(), query: 'javascript' }),
    ).toHaveLength(1);
  });
  it('returns everything when no filter is set', () => {
    expect(filterFindings(findings, emptyFilters())).toHaveLength(3);
  });
});

describe('groupFindings', () => {
  it('groups by category and counts severities', () => {
    const groups = groupFindings([
      finding({ id: 'a', category: 'technical', severity: 'error' }),
      finding({ id: 'b', category: 'technical', severity: 'warning' }),
      finding({ id: 'c', category: 'ui', severity: 'info' }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(['technical', 'ui']);
    expect(groups[0]?.errors).toBe(1);
    expect(groups[0]?.warnings).toBe(1);
    expect(groups[0]?.findings).toHaveLength(2);
  });
  it('sorts findings by severity inside a group', () => {
    const groups = groupFindings([
      finding({ id: 'a', severity: 'info' }),
      finding({ id: 'b', severity: 'error' }),
      finding({ id: 'c', severity: 'warning' }),
    ]);
    expect(groups[0]?.findings.map((item) => item.severity)).toEqual([
      'error',
      'warning',
      'info',
    ]);
  });
});

describe('summarizeFindings', () => {
  it('counts severities and confidence states', () => {
    const summary = summarizeFindings([
      finding({ id: 'a', severity: 'error', status: 'confirmed' }),
      finding({ id: 'b', severity: 'warning', status: 'uncertain' }),
      finding({ id: 'c', severity: 'info', status: 'confirmed' }),
    ]);
    expect(summary).toEqual({
      total: 3,
      errors: 1,
      warnings: 1,
      infos: 1,
      confirmed: 2,
      uncertain: 1,
    });
  });
});

describe('summarizeScan', () => {
  it('counts only analyzed pages and marks incomplete ones', () => {
    const job = {
      result: {
        complete: false,
        pages: [
          {
            url: 'https://example.com',
            viewport: 'desktop',
            complete: true,
            access: 'ok',
            findings: [finding({ id: 'a' })],
          },
          {
            url: 'https://example.com',
            viewport: 'mobile',
            complete: false,
            access: 'blocked',
            findings: [],
          },
        ],
      },
    } as unknown as ScanJob;
    const summary = summarizeScan(job);
    expect(summary.pages).toBe(2);
    expect(summary.analyzedPages).toBe(1);
    expect(summary.incompletePages).toBe(1);
    expect(summary.findings.total).toBe(1);
  });
  it('is safe without a result', () => {
    const summary = summarizeScan(null);
    expect(summary.pages).toBe(0);
    expect(summary.findings.total).toBe(0);
  });
});

const check = (overrides: Partial<ScanCheck>): ScanCheck => ({
  id: 'T01:desktop:https://example.com',
  rule: 'T01',
  title: 'JavaScript çalışma zamanı hataları',
  category: 'technical',
  status: 'passed',
  url: 'https://example.com',
  viewport: 'desktop',
  message: 'Hata oluşmadı.',
  checkedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('Kontrol sonuçları', () => {
  it('durumları sayar', () => {
    const totals = summarizeChecks([
      check({ id: 'a' }),
      check({ id: 'b', status: 'failed' }),
      check({ id: 'c', status: 'inconclusive' }),
      check({ id: 'd', status: 'skipped' }),
    ]);
    expect(totals).toEqual({
      total: 4,
      passed: 1,
      failed: 1,
      inconclusive: 1,
      skipped: 1,
    });
  });
  it('kontrolleri kategoriye göre gruplar', () => {
    const groups = groupChecks([
      check({ id: 'a' }),
      check({ id: 'b', category: 'ui', rule: 'U02' }),
      check({ id: 'c', category: 'ux', rule: 'X01' }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(['technical', 'ui', 'ux']);
    expect(groups[0]?.passed).toBe(1);
    expect(groups[1]?.checks[0]?.rule).toBe('U02');
  });
  it('masaüstü kontrollerini mobilden önce sıralar', () => {
    const sorted = sortChecks([
      check({ id: 'm', viewport: 'mobile' }),
      check({ id: 'd', viewport: 'desktop' }),
    ]);
    expect(sorted.map((item) => item.viewport)).toEqual(['desktop', 'mobile']);
  });
  it('eski kayıtları kontrolsüz olarak tanır', () => {
    expect(hasCheckResults(null)).toBe(false);
    expect(hasCheckResults({ pages: [], complete: true } as never)).toBe(false);
    expect(
      hasCheckResults({
        pages: [],
        complete: true,
        checks: [check({})],
      } as never),
    ).toBe(true);
  });
});

describe('PageSpeed etiketleri', () => {
  it('hata sınıflarını okunur metne çevirir', () => {
    expect(pageSpeedErrorLabel('PAGESPEED_QUOTA')).toBe('Kota doldu');
    expect(pageSpeedErrorLabel('PAGESPEED_PERMISSION')).toBe(
      'Yetkilendirme reddi',
    );
    expect(pageSpeedErrorLabel('PAGESPEED_INVALID_KEY')).toBe(
      'Anahtar geçersiz',
    );
    expect(pageSpeedErrorLabel(undefined)).toBe('');
  });
  it('stratejiyi yerelleştirir', () => {
    expect(pageSpeedStrategyLabel('mobile')).toBe('Mobil');
    expect(pageSpeedStrategyLabel('desktop')).toBe('Masaüstü');
  });
});
