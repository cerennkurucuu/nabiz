import { provideHttpClient } from '@angular/common/http';
import {
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeTr from '@angular/common/locales/tr';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TurkishPaginatorIntl } from './core/i18n/turkish-paginator.intl';

// Tarih, saat ve sayı biçimleri Türkçe yerel ayarıyla gösterilir.
registerLocaleData(localeTr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideAnimationsAsync(),
    { provide: LOCALE_ID, useValue: 'tr' },
    { provide: MatPaginatorIntl, useClass: TurkishPaginatorIntl },
  ],
};
