import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  NgZone,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from './auth.service';
import { GoogleIdentityService } from './google-identity.service';

@Component({
  selector: 'app-google-login',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="google-login" [attr.aria-busy]="loading() || submitting()">
      <div #button [hidden]="loading() || submitting() || failed()"></div>
      @if (loading()) {
        <p role="status" class="nabiz-meta">Google girişi hazırlanıyor…</p>
      }
      @if (submitting()) {
        <p role="status" class="nabiz-meta">Giriş yapılıyor…</p>
      }
      @if (failed()) {
        <button mat-stroked-button type="button" (click)="prepare()">
          Girişi tekrar dene
        </button>
      }
    </div>
  `,
  styles: `
    .google-login {
      display: grid;
      gap: var(--nabiz-space-2);
      justify-items: start;
      min-height: 44px;
    }
  `,
})
export class GoogleLoginComponent {
  private readonly button =
    viewChild.required<ElementRef<HTMLElement>>('button');
  private readonly auth = inject(AuthService);
  private readonly google = inject(GoogleIdentityService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  readonly signedIn = output<void>();
  readonly failure = output<string>();
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly failed = signal(false);

  constructor() {
    afterNextRender(() => {
      void this.prepare();
    });
  }

  async prepare() {
    if (this.loading() || this.submitting() || this.destroyRef.destroyed)
      return;
    this.loading.set(true);
    this.failed.set(false);
    this.failure.emit('');
    try {
      const [gis, result] = await Promise.all([
        this.google.load(),
        firstValueFrom(
          this.auth.challenge().pipe(takeUntilDestroyed(this.destroyRef)),
        ),
      ]);
      if (this.destroyRef.destroyed) return;
      const challenge = result.data;
      gis.initialize({
        client_id: challenge.clientId,
        nonce: challenge.nonce,
        auto_select: false,
        ux_mode: 'popup',
        callback: (response) =>
          this.zone.run(() => {
            if (this.submitting() || this.destroyRef.destroyed) return;
            this.submitting.set(true);
            this.auth
              .login(response.credential, challenge.state)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: () => {
                  this.submitting.set(false);
                  this.signedIn.emit();
                },
                error: () => {
                  this.submitting.set(false);
                  this.failed.set(true);
                  this.failure.emit(
                    'Google girişi tamamlanamadı. Tekrar deneyin.',
                  );
                },
              });
          }),
      });
      this.button().nativeElement.replaceChildren();
      gis.renderButton(this.button().nativeElement, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'tr',
      });
    } catch {
      if (!this.destroyRef.destroyed) {
        this.failed.set(true);
        this.failure.emit(
          'Google giriş hizmetine ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.',
        );
      }
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false);
    }
  }
}
