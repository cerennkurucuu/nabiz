import { describe, expect, it } from 'vitest';
import {
  compareReports,
  finding,
  type PageReport,
} from '../src/modules/scanning/findings.js';
const a = finding('X01', 'https://example.com/', '#name', 'missing');
const b = finding('T01', 'https://example.com/', '', 'error');
const page = (
  findings = [a],
  complete = true,
  viewport: PageReport['viewport'] = 'mobile',
): PageReport => ({ url: a.url, findings, complete, viewport });
describe('Finding reports', () => {
  it('gives every rule a stable identity, category, suggestion and bounded evidence', () => {
    for (const code of [
      'T01',
      'T02',
      'T03',
      'T04',
      'U02',
      'U04',
      'X01',
    ] as const) {
      const f = finding(code, a.url, '#test', 'x'.repeat(3000));
      expect(f.evidence).toHaveLength(2000);
      expect(f.suggestion.length).toBeGreaterThan(0);
      expect(f.id).toHaveLength(64);
    }
  });
  it('separates added, continuing and resolved', () => {
    expect(compareReports([page()], [page([b])])).toMatchObject({
      added: [b],
      resolved: [a],
      continuing: [],
      unverified: [],
    });
    expect(compareReports([page()], [page()]).continuing).toEqual([a]);
  });
  it('does not claim a partial or absent viewport resolved an issue', () => {
    expect(compareReports([page()], [page([], false)]).unverified).toEqual([a]);
    expect(
      compareReports([page()], [page([], true, 'desktop')]).unverified,
    ).toEqual([a]);
    expect(compareReports([page()], []).resolved).toEqual([]);
  });
  it('marks uncertain evidence as informational', () => {
    expect(finding('T03', a.url, '', 'blocked', true)).toMatchObject({
      status: 'uncertain',
      confidence: 'low',
      severity: 'info',
    });
  });
});
