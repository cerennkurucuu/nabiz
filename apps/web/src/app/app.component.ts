import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { ApiService } from './core/api/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly status = signal('API bağlantısı kontrol ediliyor…');

  constructor() {
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
}
