import { provideHttpClient } from '@angular/common/http';
import {
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideHttpClient()],
};
