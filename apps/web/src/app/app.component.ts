import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { ApiService } from './core/api/api.service';
import { AuthService } from './core/auth/auth.service';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly authLoading = signal(true);
  readonly signingOut = signal(false);
  readonly authError = signal('');
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly status = signal('API bağlantısı kontrol ediliyor…');

  constructor() {
    if (
      new URLSearchParams(this.document.location?.search).get('auth') ===
      'failed'
    ) {
      this.authError.set('Google girişi tamamlanamadı. Lütfen tekrar deneyin.');
    }
    this.auth
      .refresh()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.authLoading.set(false),
        error: () => {
          this.authLoading.set(false);
          this.authError.set(
            'Oturum bilgisi alınamadı. Sayfayı yenileyip tekrar deneyin.',
          );
        },
      });
    this.api
      .health()
      .pipe(timeout(5000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.status.set(
            response.data.status === 'ok'
              ? 'API bağlantısı hazır.'
              : 'API beklenmeyen bir yanıt verdi.',
          ),
        error: () =>
          this.status.set(
            "API'ye ulaşılamadı. Sunucunun çalıştığını kontrol edin.",
          ),
      });
  }

  logout() {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.authError.set('');
    this.auth
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.signingOut.set(false),
        error: () => {
          this.signingOut.set(false);
          this.authError.set(
            'Oturum kapatılamadı. Sayfayı yenileyip tekrar deneyin.',
          );
          this.auth
            .refresh()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              error: () =>
                this.authError.set(
                  'Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.',
                ),
            });
        },
      });
  }
}
