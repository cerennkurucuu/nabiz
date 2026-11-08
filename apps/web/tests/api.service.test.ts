import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { createEnvironmentInjector, Injector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService, API_BASE_URL } from '../src/app/core/api/api.service';

describe('ApiService', () => {
  it('uses the configured API address', () => {
    const get = vi.fn(() => of({ data: { status: 'ok', service: 'nabiz-api' } }));
    const injector = createEnvironmentInjector([
      { provide: HttpClient, useValue: { get } },
      { provide: API_BASE_URL, useValue: '/test-api/' }
    ], Injector.NULL as EnvironmentInjector);
    const service = runInInjectionContext(injector, () => new ApiService());
    let status: string | undefined;
    service.health().subscribe(result => { status = result.data.status; });
    expect(get).toHaveBeenCalledWith('/test-api/health');
    expect(status).toBe('ok');
    injector.destroy();
  });
  it('propagates connection failures to the caller', () => {
    const failure = new Error('Unavailable');
    const injector = createEnvironmentInjector([
      { provide: HttpClient, useValue: { get: () => throwError(() => failure) } },
      { provide: API_BASE_URL, useValue: '/api' }
    ], Injector.NULL as EnvironmentInjector);
    const service = runInInjectionContext(injector, () => new ApiService());
    let failed = false;
    service.health().subscribe({ error: error => { failed = error === failure; } });
    expect(failed).toBe(true);
    injector.destroy();
  });
});
