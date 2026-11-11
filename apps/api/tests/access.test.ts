import { describe, expect, it } from 'vitest';
import {
  assessDocumentAccess,
  isAmbiguousResourceStatus,
} from '../src/modules/scanning/access.js';

describe('Document access classification', () => {
  it('treats a successful response as analyzable', () => {
    expect(
      assessDocumentAccess(200, '<html><body>Merhaba</body></html>'),
    ).toEqual({ access: 'ok' });
    expect(assessDocumentAccess(204, '')).toEqual({ access: 'ok' });
  });
  it('separates authentication, permission and rate limit answers', () => {
    expect(assessDocumentAccess(401, '')).toMatchObject({
      access: 'blocked',
      error: 'AUTH_REQUIRED',
    });
    expect(assessDocumentAccess(403, '<html>Yasak</html>')).toMatchObject({
      access: 'blocked',
      error: 'ACCESS_DENIED',
    });
    expect(assessDocumentAccess(429, '<html>Yavaş ol</html>')).toMatchObject({
      access: 'blocked',
      error: 'RATE_LIMITED',
    });
  });
  it('recognizes bot protection and captcha pages', () => {
    expect(
      assessDocumentAccess(403, '<div id="cf-chl-widget-1"></div>'),
    ).toMatchObject({ access: 'blocked', error: 'BOT_PROTECTION' });
    expect(
      assessDocumentAccess(403, '<div class="g-recaptcha"></div>'),
    ).toMatchObject({ access: 'blocked', error: 'BOT_PROTECTION' });
    expect(
      assessDocumentAccess(429, '<p>Please verify you are a human</p>'),
    ).toMatchObject({ access: 'blocked', error: 'BOT_PROTECTION' });
    expect(
      assessDocumentAccess(
        200,
        '<title>Just a moment...</title><div id="cf-chl-widget-2"></div>',
      ),
    ).toMatchObject({ access: 'blocked', error: 'BOT_PROTECTION' });
  });
  it('does not read a captcha word in a successful normal page as a block', () => {
    expect(
      assessDocumentAccess(
        200,
        '<h1>CAPTCHA nedir?</h1><p>Bir form doğrulama yöntemidir.</p>',
      ),
    ).toEqual({ access: 'ok' });
  });
  it('marks server errors as unavailable instead of a quality defect', () => {
    expect(assessDocumentAccess(500, '<p>Hata</p>')).toMatchObject({
      access: 'unavailable',
      error: 'SERVER_ERROR',
    });
    expect(assessDocumentAccess(404, '<p>Yok</p>')).toMatchObject({
      access: 'unavailable',
      error: 'SERVER_ERROR',
    });
  });
  it('always explains a blocked or unavailable page', () => {
    for (const status of [401, 403, 429, 500]) {
      const assessment = assessDocumentAccess(status, '');
      expect(assessment.statusMessage).toBeTruthy();
      expect(assessment.statusMessage).toContain('değerlendirilmedi');
    }
  });
  it('marks only ambiguous resource statuses as uncertain', () => {
    expect(isAmbiguousResourceStatus(401)).toBe(true);
    expect(isAmbiguousResourceStatus(403)).toBe(true);
    expect(isAmbiguousResourceStatus(429)).toBe(true);
    expect(isAmbiguousResourceStatus(404)).toBe(false);
    expect(isAmbiguousResourceStatus(500)).toBe(false);
  });
});
