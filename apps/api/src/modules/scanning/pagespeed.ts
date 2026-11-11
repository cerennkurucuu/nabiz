/**
 * PageSpeed Insights entegrasyonu.
 *
 * Chromium taramasından bağımsız çalışır: Google'ın PageSpeed Insights
 * API'sinden alınan sonuçlar kendi kural setiyle değerlendirilir. API
 * çağrısı başarısız olursa neden saklanır ve raporda gösterilir; hiçbir
 * zaman "başarılı" sonucu uydurulmaz.
 */

export type PageSpeedStrategy = 'desktop' | 'mobile';

/** Hata sınıfı: kullanıcı hangi düzeltmeyi yapması gerektiğini görür. */
export type PageSpeedErrorCode =
  | 'PAGESPEED_QUOTA'
  | 'PAGESPEED_PERMISSION'
  | 'PAGESPEED_INVALID_KEY'
  | 'PAGESPEED_UNAVAILABLE'
  | 'PAGESPEED_TIMEOUT'
  | 'PAGESPEED_NETWORK'
  | 'PAGESPEED_INVALID_RESPONSE';

/** PageSpeed Insights sağlayıcısı; testlerde sahte uygulama kullanılabilir. */
export interface PageSpeedProvider {
  collect(urls: string[], signal: AbortSignal): Promise<PageSpeedResult[]>;
}

export interface PageSpeedScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export interface PageSpeedMetrics {
  firstContentfulPaint?: string | undefined;
  largestContentfulPaint?: string | undefined;
  totalBlockingTime?: string | undefined;
  cumulativeLayoutShift?: string | undefined;
  speedIndex?: string | undefined;
  /** Etkileşimden sonraki gecikme; API sürümü destekliyorsa dolar. */
  interactionToNextPaint?: string | undefined;
  /** İlk bayt süresi (sunucu yanıt süresi). */
  timeToFirstByte?: string | undefined;
}

/**
 * CrUX saha verisi. Lighthouse laboratuvar (sentetik) verisiyle karıştırılmaz;
 * gerçek kullanıcı ölçümleri ayrı gösterilir.
 */
export interface PageSpeedFieldData {
  /** Genel kategori: FAST, AVERAGE veya SLOW. */
  category: string | null;
  metrics: { name: string; value: string; percentile: string }[];
}

export interface PageSpeedResult {
  url: string;
  strategy: PageSpeedStrategy;
  ok: boolean;
  scores?: PageSpeedScores | undefined;
  metrics?: PageSpeedMetrics | undefined;
  /** CrUX saha verisi (sayfa düzeyi). */
  fieldData?: PageSpeedFieldData | undefined;
  /** CrUX saha verisi (kaynak düzeyi). */
  originFieldData?: PageSpeedFieldData | undefined;
  /** Başarısızlık nedeni (ağ hatası, kota, yetkilendirme, geçersiz yanıt). */
  error?: string | undefined;
  /** Hata sınıfı; arayüzde düzeltme yönergesi gösterilir. */
  errorCode?: PageSpeedErrorCode | undefined;
  /** API anahtarı yapılandırılmış mı; anonim çağrıda false. */
  apiKeyConfigured?: boolean | undefined;
  checkedAt: string;
}

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const readMetric = (
  audit: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  if (!audit) return undefined;
  const value = audit[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
};

export interface PageSpeedErrorShape {
  code?: number | undefined;
  status?: string | undefined;
  message?: string | undefined;
}

/**
 * Google'ın hata gövdesini anlaşılır bir sınıfa çevirir. Kota, yetkilendirme
 * ve geçersiz anahtar ayrı ayrı gösterilir; kullanıcı hangi yapılandırmanın
 * eksik olduğunu bu metinden anlar.
 */
export function classifyPageSpeedError(
  error: PageSpeedErrorShape | undefined,
  httpStatus: number,
  options: { apiKeyConfigured?: boolean | undefined } = {},
): { code: PageSpeedErrorCode; message: string } {
  const status = error?.status ?? '';
  const message = error?.message ?? '';
  const text = `${status} ${message}`.toLowerCase();
  const original = message.trim();
  const suffix = original ? ` Google yanıtı: ${original}` : '';
  const configNote = options.apiKeyConfigured
    ? ''
    : ' PAGESPEED_API_KEY ortam değişkeni tanımlı değil; istek anonim kotayla yapıldı. Sürdürülebilir kullanım için API anahtarı yapılandırılmalıdır.';

  if (
    httpStatus === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('resource_exhausted')
  )
    return {
      code: 'PAGESPEED_QUOTA',
      message: `PageSpeed Insights kotası doldu (HTTP ${httpStatus}). Google'ın bu API için günlük istek sınırı aşıldı; puan alınamadı. Kota sınırı artırılmalı veya anahtarın ait olduğu proje üzerinden yeni kota talep edilmeli.${suffix}${configNote}`,
    };
  if (
    httpStatus === 403 ||
    status === 'PERMISSION_DENIED' ||
    text.includes('permission denied') ||
    text.includes('access_denied')
  ) {
    // Anahtar "web sitesi" (HTTP yönlendirici) kısıtlamasıyla sınırlandırılmışsa
    // sunucudan gelen isteklerde Referer başlığı bulunmadığı için reddedilir.
    if (text.includes('referer') || text.includes('referrer')) {
      return {
        code: 'PAGESPEED_PERMISSION',
        message: `PageSpeed Insights isteği reddedildi (HTTP ${httpStatus}): anahtarın HTTP yönlendirici (web sitesi) kısıtlaması nedeniyle sunucudan gelen ve Referer başlığı taşımayan istekler engellendi. Anahtarın kısıtlaması "Web siteleri" yerine "API'ler" veya "Hiçbiri" olarak değiştirilmelidir.${suffix}${configNote}`,
      };
    }
    return {
      code: 'PAGESPEED_PERMISSION',
      message: `PageSpeed Insights API'sine erişim reddedildi (HTTP ${httpStatus}). API anahtarının ait olduğu Google Cloud projesinde PageSpeed Insights API etkinleştirilmeli ve anahtar bu servise yetkili olmalıdır.${suffix}${configNote}`,
    };
  }
  if (
    text.includes('api key') ||
    text.includes('apikey') ||
    text.includes('api_key_invalid')
  )
    return {
      code: 'PAGESPEED_INVALID_KEY',
      message: `Google API anahtarı reddedildi (HTTP ${httpStatus}). Anahtarın geçerli olduğundan ve PageSpeed Insights API için etkin olduğundan emin olun.${suffix}`,
    };
  if (httpStatus >= 500)
    return {
      code: 'PAGESPEED_UNAVAILABLE',
      message: `PageSpeed Insights servisi şu anda yanıt vermiyor (HTTP ${httpStatus}). Sonuç alınamadı; geçici bir servis kesintisi olabilir.${suffix}`,
    };
  return {
    code: 'PAGESPEED_UNAVAILABLE',
    message: `PageSpeed Insights verisi alınamadı (HTTP ${httpStatus}).${suffix}${configNote}`,
  };
}

/**
 * CrUX saha verisini okur. Lighthouse laboratuvar ölçümleriyle aynı kovalarda
 * gösterilmez; kullanıcı deneyimi gerçek ölçümden ayrı tutulur.
 */
export function parseFieldData(
  experience: unknown,
): PageSpeedFieldData | undefined {
  if (!experience || typeof experience !== 'object') return undefined;
  const data = experience as {
    overall_category?: string;
    metrics?: Record<
      string,
      { percentile?: number; distribution?: Record<string, number> }
    >;
  };
  const metrics: PageSpeedFieldData['metrics'] = [];
  for (const [name, metric] of Object.entries(data.metrics ?? {})) {
    const distribution = metric.distribution ?? {};
    const keys = Object.keys(distribution).sort(
      (a, b) => Number(a) - Number(b),
    );
    // Dağılımda yüzdelik anahtarı -> o yüzdelikteki kullanıcı oranı.
    const percentile =
      keys.find((key) => key === '75') ??
      keys.find((key) => key === '90') ??
      keys.at(-1);
    metrics.push({
      name,
      value: percentile ? distribution[percentile]!.toString() : '—',
      percentile: percentile ?? '—',
    });
  }
  if (!metrics.length && !data.overall_category) return undefined;
  return { category: data.overall_category ?? null, metrics };
}

export function parsePageSpeedResponse(
  url: string,
  strategy: PageSpeedStrategy,
  payload: unknown,
  options: { apiKeyConfigured?: boolean | undefined } = {},
): PageSpeedResult {
  const checkedAt = new Date().toISOString();
  const data = payload as {
    lighthouseResult?: {
      categories?: Record<string, { score?: number | null; title?: string }>;
      audits?: Record<string, Record<string, unknown>>;
    };
    loadingExperience?: unknown;
    originLoadingExperience?: unknown;
    error?: { message?: string; code?: number; status?: string };
  };
  const apiKeyConfigured = options.apiKeyConfigured ?? false;
  if (!data?.lighthouseResult) {
    const classified = classifyPageSpeedError(
      data?.error,
      data?.error?.code ?? 502,
      { apiKeyConfigured },
    );
    return {
      url,
      strategy,
      ok: false,
      error: classified.message,
      errorCode: classified.code,
      apiKeyConfigured,
      checkedAt,
    };
  }
  const categories = data.lighthouseResult.categories ?? {};
  const score = (key: string) => {
    const value = categories[key]?.score;
    return typeof value === 'number' ? Math.round(value * 100) : null;
  };
  const audits = data.lighthouseResult.audits ?? {};
  const fieldData = parseFieldData(data.loadingExperience);
  const originFieldData = parseFieldData(data.originLoadingExperience);
  return {
    url,
    strategy,
    ok: true,
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
    },
    metrics: {
      firstContentfulPaint: readMetric(
        audits['first-contentful-paint'],
        'displayValue',
      ),
      largestContentfulPaint: readMetric(
        audits['largest-contentful-paint'],
        'displayValue',
      ),
      totalBlockingTime: readMetric(
        audits['total-blocking-time'],
        'displayValue',
      ),
      cumulativeLayoutShift: readMetric(
        audits['cumulative-layout-shift'],
        'displayValue',
      ),
      speedIndex: readMetric(audits['speed-index'], 'displayValue'),
      interactionToNextPaint:
        readMetric(audits['interaction-to-next-paint'], 'displayValue') ??
        readMetric(
          audits['experimental-interaction-to-next-paint'],
          'displayValue',
        ),
      timeToFirstByte:
        readMetric(audits['server-response-time'], 'displayValue') ??
        readMetric(audits['experimental-time-to-first-byte'], 'displayValue'),
    },
    ...(fieldData ? { fieldData } : {}),
    ...(originFieldData ? { originFieldData } : {}),
    apiKeyConfigured,
    checkedAt,
  };
}

export interface PageSpeedOptions {
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export async function runPageSpeed(
  url: string,
  strategy: PageSpeedStrategy,
  options: PageSpeedOptions = {},
): Promise<PageSpeedResult> {
  const checkedAt = new Date().toISOString();
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45000;
  const apiKeyConfigured = Boolean(options.apiKey);
  const params = new URLSearchParams({
    url,
    strategy,
  });
  for (const category of [
    'performance',
    'accessibility',
    'best-practices',
    'seo',
  ])
    params.append('category', category);
  if (options.apiKey) params.set('key', options.apiKey);
  const endpoint = `${ENDPOINT}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(endpoint, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        url,
        strategy,
        ok: false,
        error: `PageSpeed Insights JSON olmayan bir yanıt döndürdü (HTTP ${response.status}).`,
        errorCode: 'PAGESPEED_INVALID_RESPONSE',
        apiKeyConfigured,
        checkedAt,
      };
    }
    if (!response.ok) {
      const data = payload as {
        error?: { message?: string; code?: number; status?: string };
      };
      const classified = classifyPageSpeedError(
        data?.error ?? { code: response.status },
        response.status,
        { apiKeyConfigured },
      );
      return {
        url,
        strategy,
        ok: false,
        error: classified.message,
        errorCode: classified.code,
        apiKeyConfigured,
        checkedAt,
      };
    }
    return parsePageSpeedResponse(url, strategy, payload, { apiKeyConfigured });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || /abort/i.test(error.message));
    return {
      url,
      strategy,
      ok: false,
      error: timedOut
        ? `PageSpeed Insights isteği ${Math.round(timeoutMs / 1000)} saniye içinde tamamlanmadı.`
        : `PageSpeed Insights verisi alınamadı: ${
            error instanceof Error ? error.message : 'bilinmeyen hata'
          }`,
      errorCode: timedOut ? 'PAGESPEED_TIMEOUT' : 'PAGESPEED_NETWORK',
      apiKeyConfigured,
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
