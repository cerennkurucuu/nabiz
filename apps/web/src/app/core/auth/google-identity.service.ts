import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback: (response: { credential: string }) => void;
    auto_select: boolean;
    ux_mode: 'popup';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'signin_with';
      locale: 'tr';
    },
  ): void;
  disableAutoSelect(): void;
  cancel(): void;
}
type GoogleWindow = Window & {
  google?: { accounts: { id: GoogleIdentityApi } };
};

@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  private readonly document = inject(DOCUMENT);
  private loading: Promise<GoogleIdentityApi> | undefined;

  load(): Promise<GoogleIdentityApi> {
    const existing = this.api();
    if (existing) return Promise.resolve(existing);
    if (this.loading) return this.loading;
    this.loading = new Promise((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        this.loading = undefined;
        reject(new Error('Google giriş hizmeti yüklenemedi.'));
      };
      const timer = setTimeout(fail, 10000);
      script.onerror = fail;
      script.onload = () => {
        const api = this.api();
        if (!api) {
          fail();
          return;
        }
        clearTimeout(timer);
        resolve(api);
      };
      this.document.head.appendChild(script);
    });
    return this.loading;
  }

  disableAutoSelect() {
    this.api()?.disableAutoSelect();
  }
  private api() {
    return (this.document.defaultView as GoogleWindow | null)?.google?.accounts
      .id;
  }
}
