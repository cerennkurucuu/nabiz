import '@angular/compiler';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  createEnvironmentInjector,
  Injector,
  runInInjectionContext,
  type EnvironmentInjector,
} from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../src/app/core/api/api.service';
import {
  ScanService,
  scanErrorMessage,
  jobOutcomeText,
  pageOutcomeText,
} from '../src/app/core/scans/scan.service';
import { AuthService } from '../src/app/core/auth/auth.service';
import type { ScanJob, ScanPageReport } from '../../packages/contracts/api';

const session = {
  configured: true,
  user: { id: 'u1', email: 'a@b.test', name: 'A' },
  csrfToken: 'csrf-token',
};

function injectorWith(http: unknown, csrf: string | null = 'csrf-token') {
  return createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: http },
      { provide: API_BASE_URL, useValue: '/test-api/' },
      {
        provide: AuthService,
        useValue: {
          session: () => (csrf ? { ...session, csrfToken: csrf } : null),
        },
      },
    ],
    Injector.NULL as EnvironmentInjector,
  );
}

describe('ScanService', () => {
  it('reads the scan capabilities and history from the API', () => {
    const get = vi.fn((url: string) =>
      of({ data: url.includes('capabilities') ? { enabled: true } : [] }),
    );
    const injector = injectorWith({ get });
    const service = runInInjectionContext(injector, () => new ScanService());
    let enabled: boolean | undefined;
    service
      .capabilities()
      .subscribe((response) => (enabled = response.data.enabled));
    service.list().subscribe();
    expect(get).toHaveBeenCalledWith('/test-api/scans/capabilities', {
      withCredentials: true,
    });
    expect(get).toHaveBeenCalledWith('/test-api/scans', {
      withCredentials: true,
    });
    expect(enabled).toBe(true);
    injector.destroy();
  });

  it('sends the CSRF token when a scan is created and cancelled', () => {
    const post = vi.fn(() => of({ data: { id: 'job-1' } }));
    const injector = injectorWith({ post });
    const service = runInInjectionContext(injector, () => new ScanService());
    service.create(['https://example.com']).subscribe();
    service.cancel('job-1').subscribe();
    expect(post).toHaveBeenCalledWith(
      '/test-api/scans',
      { urls: ['https://example.com'] },
      { withCredentials: true, headers: { 'X-CSRF-Token': 'csrf-token' } },
    );
    expect(post).toHaveBeenCalledWith(
      '/test-api/scans/job-1/cancel',
      {},
      { withCredentials: true, headers: { 'X-CSRF-Token': 'csrf-token' } },
    );
    injector.destroy();
  });

  it('compares two scans for a shared address', () => {
    const get = vi.fn(() => of({ data: { added: [], continuing: [] } }));
    const injector = injectorWith({ get });
    const service = runInInjectionContext(injector, () => new ScanService());
    service.compare('a', 'b', 'https://example.com').subscribe();
    expect(get).toHaveBeenCalledWith('/test-api/scans/compare/a/b', {
      withCredentials: true,
      params: { url: 'https://example.com' },
    });
    injector.destroy();
  });

  it('stops watching when the scan reaches a terminal status', async () => {
    const states = [
      { id: 'job-1', status: 'running', progress: 40 },
      { id: 'job-1', status: 'completed', progress: 100 },
    ];
    let call = 0;
    const get = vi.fn(() => of({ data: states[call++] }));
    const injector = injectorWith({ get });
    const service = runInInjectionContext(injector, () => new ScanService());
    const seen: string[] = [];
    await new Promise<void>((resolve) => {
      service.watch('job-1').subscribe({
        next: (job) => seen.push(job.status),
        complete: () => resolve(),
      });
    });
    expect(seen).toEqual(['running', 'completed']);
    injector.destroy();
  });

  it('reports the API message when a request fails', () => {
    const failure = new HttpErrorResponse({
      status: 400,
      error: { error: { message: 'Geçersiz adres.' } },
    });
    expect(scanErrorMessage(failure)).toBe('Geçersiz adres.');
    const offline = new HttpErrorResponse({ status: 0 });
    expect(scanErrorMessage(offline)).toContain("API'ye ulaşılamadı");
    expect(scanErrorMessage(new Error('boom'))).toContain(
      'İşlem tamamlanamadı',
    );
    const failing = injectorWith({
      get: () => throwError(() => new Error('down')),
    });
    const service = runInInjectionContext(failing, () => new ScanService());
    let failed = false;
    service.list().subscribe({ error: () => (failed = true) });
    expect(failed).toBe(true);
    failing.destroy();
  });
});

const page = (overrides: Partial<ScanPageReport>): ScanPageReport => ({
  url: 'https://example.com',
  viewport: 'desktop',
  complete: true,
  findings: [],
  ...overrides,
});

describe('Scan outcome messages', () => {
  it('explains a blocked view instead of presenting it as clean', () => {
    expect(
      pageOutcomeText(
        page({
          complete: false,
          access: 'blocked',
          error: 'BOT_PROTECTION',
          statusMessage: 'Bot koruması erişimi engelledi.',
        }),
      ),
    ).toBe('Bot koruması erişimi engelledi.');
    expect(
      pageOutcomeText(page({ complete: false, access: 'blocked' })),
    ).toContain('değerlendirilmedi');
  });
  it('explains an unreadable and an incomplete view', () => {
    expect(
      pageOutcomeText(page({ complete: false, access: 'unavailable' })),
    ).toContain('analiz edilemedi');
    expect(pageOutcomeText(page({ complete: false }))).toContain(
      'analiz edilemedi',
    );
  });
  it('reports a clean view without findings', () => {
    expect(pageOutcomeText(page({}))).toBe('Bu görünümde bulgu yok.');
  });
  it('marks a partially analyzed scan as an incomplete scan', () => {
    const job = {
      result: {
        complete: false,
        pages: [page({}), page({ complete: false })],
      },
    } as unknown as ScanJob;
    expect(jobOutcomeText(job)).toBe(
      'Eksik tarama: 1 görünüm analiz edilemedi.',
    );
    const done = {
      result: { complete: true, pages: [page({})] },
    } as unknown as ScanJob;
    expect(jobOutcomeText(done)).toBe('Tarama tamamlandı.');
    expect(jobOutcomeText({ status: 'running' } as unknown as ScanJob)).toBe(
      'Tarama sürüyor.',
    );
  });
});
