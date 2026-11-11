import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  distinctUntilChanged,
  map,
  Observable,
  switchMap,
  takeWhile,
  timer,
} from 'rxjs';
import { API_BASE_URL } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import type {
  ApiResponse,
  ScanCapabilities,
  ScanComparison,
  ScanJob,
  ScanPageReport,
} from '../../../../../../packages/contracts/api';

export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

// A blocked or unreadable view has no quality verdict. The screen must say so
// instead of presenting an empty finding list as a healthy page.
export function pageOutcomeText(page: ScanPageReport): string {
  if (page.access === 'blocked')
    return (
      page.statusMessage ??
      'Erişim engellendi. Bu sayfa kalite kusuru olarak değerlendirilmedi.'
    );
  if (page.access === 'unavailable')
    return (
      page.statusMessage ??
      'Sayfa içeriği alınamadı. Bu görünüm analiz edilemedi.'
    );
  if (!page.complete)
    return (
      page.statusMessage ??
      'Bu görünüm tam olarak analiz edilemedi; bulgular eksiktir.'
    );
  return 'Bu görünümde bulgu yok.';
}

export function jobOutcomeText(job: ScanJob): string {
  const pages = job.result?.pages ?? [];
  const incomplete = pages.filter((page) => !page.complete);
  if (!job.result) return 'Tarama sürüyor.';
  if (!incomplete.length) return 'Tarama tamamlandı.';
  return `Eksik tarama: ${incomplete.length} görünüm analiz edilemedi.`;
}

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/$/, '');

  private headers() {
    return { 'X-CSRF-Token': this.auth.session()?.csrfToken ?? '' };
  }

  capabilities() {
    return this.http.get<ApiResponse<ScanCapabilities>>(
      `${this.baseUrl}/scans/capabilities`,
      { withCredentials: true },
    );
  }

  list() {
    return this.http
      .get<ApiResponse<ScanJob[]>>(`${this.baseUrl}/scans`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  get(id: string) {
    return this.http
      .get<ApiResponse<ScanJob>>(`${this.baseUrl}/scans/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  create(urls: string[]) {
    return this.http
      .post<ApiResponse<ScanJob>>(
        `${this.baseUrl}/scans`,
        { urls },
        { withCredentials: true, headers: this.headers() },
      )
      .pipe(map((response) => response.data));
  }

  cancel(id: string) {
    return this.http
      .post<ApiResponse<ScanJob>>(
        `${this.baseUrl}/scans/${id}/cancel`,
        {},
        { withCredentials: true, headers: this.headers() },
      )
      .pipe(map((response) => response.data));
  }

  compare(before: string, after: string, url: string) {
    return this.http
      .get<ApiResponse<ScanComparison>>(
        `${this.baseUrl}/scans/compare/${before}/${after}`,
        { withCredentials: true, params: { url } },
      )
      .pipe(map((response) => response.data));
  }

  // Progress is polled with the session cookie; a stopped job ends the stream.
  watch(id: string): Observable<ScanJob> {
    return timer(0, 1500).pipe(
      switchMap(() => this.get(id)),
      distinctUntilChanged(
        (previous, current) =>
          previous.status === current.status &&
          previous.progress === current.progress,
      ),
      takeWhile((job) => !TERMINAL_STATUSES.includes(job.status), true),
    );
  }
}

export function scanErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string } } | undefined;
    const message = body?.error?.message;
    if (message) return message;
    if (error.status === 0) return "API'ye ulaşılamadı. Sunucu çalışıyor mu?";
  }
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}
