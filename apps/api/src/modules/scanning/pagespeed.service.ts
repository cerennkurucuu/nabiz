import {
  runPageSpeed,
  type PageSpeedProvider,
  type PageSpeedResult,
  type PageSpeedStrategy,
} from './pagespeed.js';

export interface PageSpeedServiceOptions {
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
  enabled?: boolean | undefined;
}

/**
 * PageSpeed Insights sağlayıcısı. Her adres için mobil ve masaüstü stratejisi
 * çalıştırılır. Hata durumunda sonuç atlanmaz; neden saklanır.
 */
export class PageSpeedService implements PageSpeedProvider {
  constructor(private readonly options: PageSpeedServiceOptions = {}) {}

  async collect(
    urls: string[],
    signal: AbortSignal,
  ): Promise<PageSpeedResult[]> {
    if (this.options.enabled === false) return [];
    // İstekler paralel çalışır: tarama işinin zaman aşımı aşılmaz.
    const requests: Promise<PageSpeedResult>[] = [];
    for (const url of urls) {
      for (const strategy of ['mobile', 'desktop'] as PageSpeedStrategy[]) {
        if (signal.aborted) break;
        requests.push(
          runPageSpeed(url, strategy, {
            apiKey: this.options.apiKey,
            timeoutMs: this.options.timeoutMs ?? 25000,
            fetchImpl: this.options.fetchImpl,
          }),
        );
      }
    }
    return Promise.all(requests);
  }
}
