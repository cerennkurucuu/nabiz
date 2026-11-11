import { describe, expect, it, vi } from 'vitest';
import {
  classifyPageSpeedError,
  parsePageSpeedResponse,
  runPageSpeed,
} from '../src/modules/scanning/pagespeed.js';
import { PageSpeedService } from '../src/modules/scanning/pagespeed.service.js';

const okPayload = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.91 },
      accessibility: { score: 0.75 },
      'best-practices': { score: 1 },
      seo: { score: 0.63 },
    },
    audits: {
      'first-contentful-paint': { displayValue: '1,2 sn' },
      'largest-contentful-paint': { displayValue: '2,4 sn' },
      'total-blocking-time': { displayValue: '80 ms' },
      'cumulative-layout-shift': { displayValue: '0,02' },
      'interaction-to-next-paint': { displayValue: '120 ms' },
    },
  },
};

describe('PageSpeed Insights', () => {
  it('puanları ve ölçümleri okur', () => {
    const result = parsePageSpeedResponse(
      'https://example.com',
      'mobile',
      okPayload,
    );
    expect(result.ok).toBe(true);
    expect(result.scores?.performance).toBe(91);
    expect(result.scores?.accessibility).toBe(75);
    expect(result.scores?.seo).toBe(63);
    expect(result.metrics?.firstContentfulPaint).toBe('1,2 sn');
    expect(result.metrics?.cumulativeLayoutShift).toBe('0,02');
  });

  it('başarısız yanıtta nedeni saklar, başarı uydurmaz', () => {
    const result = parsePageSpeedResponse('https://example.com', 'desktop', {
      error: { message: 'Quota exceeded', code: 429 },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Quota exceeded');
    expect(result.scores).toBeUndefined();
  });

  it('ağ hatasında hata nedeni döner', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ağ yok');
    }) as unknown as typeof fetch;
    const result = await runPageSpeed('https://example.com', 'mobile', {
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ağ yok');
  });

  it('HTTP hatasında gövdedeki mesajı kullanır', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'URL geçersiz' } }), {
          status: 400,
        }),
    ) as unknown as typeof fetch;
    const result = await runPageSpeed('https://example.com', 'mobile', {
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('URL geçersiz');
  });

  it('her adres için mobil ve masaüstü stratejisini çalıştırır', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(okPayload), { status: 200 }),
    ) as unknown as typeof fetch;
    const service = new PageSpeedService({ fetchImpl });
    const results = await service.collect(
      ['https://example.com'],
      new AbortController().signal,
    );
    expect(results).toHaveLength(2);
    expect(results.map((item) => item.strategy)).toEqual(['mobile', 'desktop']);
    expect(results.every((item) => item.ok)).toBe(true);
    // Kullanıcının girdiği adres Google'a açıkça iletilir.
    const called = fetchImpl as unknown as {
      mock: { calls: [string][] };
    };
    expect(called.mock.calls[0]?.[0]).toContain(
      'url=https%3A%2F%2Fexample.com',
    );
    expect(called.mock.calls[0]?.[0]).toContain('strategy=mobile');
  });

  it('devre dışı bırakılabilir', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const service = new PageSpeedService({ fetchImpl, enabled: false });
    expect(
      await service.collect(
        ['https://example.com'],
        new AbortController().signal,
      ),
    ).toEqual([]);
  });

  it('etkileşim gecikmesini okur', () => {
    const result = parsePageSpeedResponse(
      'https://example.com',
      'mobile',
      okPayload,
    );
    expect(result.metrics?.interactionToNextPaint).toBe('120 ms');
  });

  it('ilk bayt süresini okur', () => {
    const result = parsePageSpeedResponse('https://example.com', 'mobile', {
      lighthouseResult: {
        categories: { performance: { score: 1 } },
        audits: { 'server-response-time': { displayValue: '180 ms' } },
      },
    });
    expect(result.metrics?.timeToFirstByte).toBe('180 ms');
  });

  it('CrUX saha verisini laboratuvar verisinden ayrı tutar', () => {
    const result = parsePageSpeedResponse('https://example.com', 'desktop', {
      lighthouseResult: {
        categories: { performance: { score: 0.8 } },
        audits: {},
      },
      loadingExperience: {
        overall_category: 'AVERAGE',
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: {
            distribution: { '0': 0.1, '50': 0.4, '75': 0.3, '100': 0.2 },
          },
        },
      },
    });
    expect(result.fieldData?.category).toBe('AVERAGE');
    expect(result.fieldData?.metrics[0]?.name).toBe(
      'LARGEST_CONTENTFUL_PAINT_MS',
    );
    expect(result.fieldData?.metrics[0]?.percentile).toBe('75');
    // Saha verisi laboratuvar puanını değiştirmez.
    expect(result.scores?.performance).toBe(80);
  });

  it('API anahtarı yapılandırılmışsa işaretler', () => {
    const result = parsePageSpeedResponse(
      'https://example.com',
      'mobile',
      okPayload,
      {
        apiKeyConfigured: true,
      },
    );
    expect(result.apiKeyConfigured).toBe(true);
  });

  describe('hata sınıflandırma', () => {
    it('kota hatasını ayrı ve anlaşılır gösterir', () => {
      const classified = classifyPageSpeedError(
        {
          status: 'RESOURCE_EXHAUSTED',
          message:
            "Quota exceeded for quota metric 'Queries' and limit 'Queries per day'",
        },
        429,
        { apiKeyConfigured: true },
      );
      expect(classified.code).toBe('PAGESPEED_QUOTA');
      expect(classified.message).toContain('kotası doldu');
      expect(classified.message).toContain('Quota exceeded');
    });

    it('yetkilendirme hatasını ayrı gösterir', () => {
      const classified = classifyPageSpeedError(
        {
          status: 'PERMISSION_DENIED',
          message: 'Permission denied on the service.',
        },
        403,
        { apiKeyConfigured: true },
      );
      expect(classified.code).toBe('PAGESPEED_PERMISSION');
      expect(classified.message).toContain('erişim reddedildi');
      expect(classified.message).toContain(
        'PageSpeed Insights API etkinleştirilmeli',
      );
      expect(classified.message).toContain('Permission denied on the service.');
    });

    it('anahtar yoksa yapılandırma gerektiğini söyler', () => {
      const classified = classifyPageSpeedError(
        {
          status: 'PERMISSION_DENIED',
          message: 'Permission denied on the service.',
        },
        403,
        { apiKeyConfigured: false },
      );
      expect(classified.message).toContain('PAGESPEED_API_KEY');
    });

    it('geçersiz anahtarı ayrı gösterir', () => {
      const classified = classifyPageSpeedError(
        { message: 'API key not valid. Please pass a valid API key.' },
        400,
      );
      expect(classified.code).toBe('PAGESPEED_INVALID_KEY');
    });

    it('yönlendirici kısıtlamasını açıkça gösterir', () => {
      const classified = classifyPageSpeedError(
        {
          status: 'PERMISSION_DENIED',
          message: 'Requests from referer <empty> are blocked.',
        },
        403,
        { apiKeyConfigured: true },
      );
      expect(classified.code).toBe('PAGESPEED_PERMISSION');
      expect(classified.message).toContain('yönlendirici');
      expect(classified.message).toContain('Web siteleri');
      expect(classified.message).toContain(
        'Requests from referer <empty> are blocked.',
      );
    });
  });

  it('HTTP 429 yanıtında kota sınıfı ve gerçek nedeni saklar', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Quota exceeded for quota metric Queries',
            },
          }),
          { status: 429 },
        ),
    ) as unknown as typeof fetch;
    const result = await runPageSpeed('https://example.com', 'mobile', {
      fetchImpl,
      apiKey: 'test-key-1234567890',
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PAGESPEED_QUOTA');
    expect(result.error).toContain('Quota exceeded');
    expect(result.apiKeyConfigured).toBe(true);
  });

  it('HTTP 403 yanıtında yetkilendirme sınıfını saklar', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              status: 'PERMISSION_DENIED',
              message: 'Permission denied on the service.',
            },
          }),
          { status: 403 },
        ),
    ) as unknown as typeof fetch;
    const result = await runPageSpeed('https://example.com', 'desktop', {
      fetchImpl,
      apiKey: 'test-key-1234567890',
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('PAGESPEED_PERMISSION');
    expect(result.error).toContain('Permission denied on the service.');
  });

  it('anahtarsız çağrıda yapılandırma notu ekler', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 429, message: 'Quota exceeded' } }),
          { status: 429 },
        ),
    ) as unknown as typeof fetch;
    const result = await runPageSpeed('https://example.com', 'mobile', {
      fetchImpl,
    });
    expect(result.apiKeyConfigured).toBe(false);
    expect(result.error).toContain('PAGESPEED_API_KEY');
  });
});
