import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap, timeout } from 'rxjs';
import { API_BASE_URL } from '../api/api.service';
import type {
  ApiResponse,
  AuthSession,
} from '../../../../../../packages/contracts/api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/$/, '');
  private readonly value = signal<AuthSession | null>(null);
  readonly session = this.value.asReadonly();
  readonly loginUrl = `${this.baseUrl}/auth/google`;

  refresh() {
    return this.http
      .get<ApiResponse<AuthSession>>(`${this.baseUrl}/auth/session`, {
        withCredentials: true,
      })
      .pipe(
        timeout(10000),
        tap((result) => this.value.set(result.data)),
      );
  }

  logout() {
    return this.http
      .post<void>(
        `${this.baseUrl}/auth/logout`,
        {},
        {
          withCredentials: true,
          headers: { 'X-CSRF-Token': this.value()?.csrfToken ?? '' },
        },
      )
      .pipe(
        timeout(10000),
        tap(() =>
          this.value.update((value) =>
            value ? { ...value, user: null, csrfToken: null } : null,
          ),
        ),
      );
  }
}
