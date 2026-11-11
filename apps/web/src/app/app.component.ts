import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from './core/api/api.service';
import { AuthService } from './core/auth/auth.service';
import { GoogleLoginComponent } from './core/auth/google-login.component';
import { ScanComponent } from './core/scans/scan.component';
import { NAV_ITEMS, VIEW_TITLE, type ScanView } from './core/scans/scan.view';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    GoogleLoginComponent,
    MatButtonModule,
    MatDividerModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
    ScanComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly authLoading = signal(true);
  readonly signingOut = signal(false);
  readonly authError = signal('');
  readonly view = signal<ScanView>('panel');
  readonly navOpen = signal(false);
  readonly navMode = signal<'side' | 'over'>('side');
  readonly navItems = NAV_ITEMS;
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly status = signal('API bağlantısı kontrol ediliyor…');
  readonly apiReady = signal(false);

  constructor() {
    // Masaüstünde menü kalıcı; dar ekranda açılıp kapanan bir panel olur.
    const narrow = window.matchMedia('(max-width: 1023px)');
    const applyMode = () => {
      const over = narrow.matches;
      this.navMode.set(over ? 'over' : 'side');
      if (over) this.navOpen.set(false);
    };
    applyMode();
    narrow.addEventListener('change', applyMode);
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
        next: (response) => {
          this.apiReady.set(response.data.status === 'ok');
          this.status.set(
            response.data.status === 'ok'
              ? 'API bağlantısı hazır.'
              : 'API beklenmeyen bir yanıt verdi.',
          );
        },
        error: () => {
          this.apiReady.set(false);
          this.status.set(
            "API'ye ulaşılamadı. Sunucunun çalıştığını kontrol edin.",
          );
        },
      });
  }

  get title() {
    return VIEW_TITLE[this.view()];
  }

  // Rapor görünümü geçmişten açılır; menüde yön kaybı olmaması için
  // geçmiş öğesi etkin görünür.
  isActive(id: ScanView) {
    if (this.view() === id) return true;
    return this.view() === 'report' && id === 'history';
  }

  setView(view: ScanView) {
    this.view.set(view);
    this.navOpen.set(false);
  }

  toggleNav() {
    this.navOpen.set(!this.navOpen());
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
