import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ApiResponse, Health } from './api.models';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root', factory: () => environment.apiBaseUrl
});

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/$/, '');

  health() {
    return this.http.get<ApiResponse<Health>>(`${this.baseUrl}/health`);
  }
}
