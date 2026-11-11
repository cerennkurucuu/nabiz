import type { Page } from 'playwright';

/**
 * SEO sayfa verisi toplayıcı.
 *
 * Sayfa içi betik yalnızca ham veriyi toplar; "başarılı/başarısız" kararı ve
 * öneri metinleri Node tarafında üretilir. Adlandırılmış fonksiyon bağı
 * kullanılmaz (tsx/esbuild `__name` sorunu).
 */

export interface SeoPageData {
  title: string;
  metaDescription: string;
  htmlLang: string;
  canonical: string;
  robots: string;
  viewportMeta: string;
  openGraph: { title: string; description: string; image: string; url: string };
  twitter: { card: string; title: string; image: string };
  headings: { level: number; text: string }[];
  h1Count: number;
  images: { total: number; missingAlt: number; missingAltSelectors: string[] };
  links: {
    total: number;
    internal: number;
    emptyText: number;
    nofollow: number;
  };
  jsonLd: {
    blocks: number;
    invalid: number;
    types: string[];
    errors: string[];
  };
}

export const pageSeoData = () => {
  // Tüm meta etiketleri tek geçişte toplanır; sayfa içi betikte adlandırılmış
  // fonksiyon bağı kullanılmaz.
  const metaContent = new Map<string, string>();
  for (const element of document.querySelectorAll(
    'meta[name], meta[property]',
  )) {
    const key =
      element.getAttribute('name') ?? element.getAttribute('property') ?? '';
    metaContent.set(key, element.getAttribute('content')?.trim() ?? '');
  }
  const openGraph = {
    title: metaContent.get('og:title') ?? '',
    description: metaContent.get('og:description') ?? '',
    image: metaContent.get('og:image') ?? '',
    url: metaContent.get('og:url') ?? '',
  };
  const twitter = {
    card: metaContent.get('twitter:card') ?? '',
    title: metaContent.get('twitter:title') ?? '',
    image: metaContent.get('twitter:image') ?? '',
  };

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    })
    .map((element) => ({
      level: Number.parseInt(element.tagName.slice(1), 10),
      text: (element.textContent ?? '').trim().slice(0, 120),
    }));

  const images = [...document.querySelectorAll('img')];
  const missingAlt = images.filter((image) => {
    const alt = image.getAttribute('alt');
    if (alt === null) return true;
    return false;
  });

  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const links = {
    total: anchors.length,
    internal: anchors.filter((anchor) => {
      try {
        return new URL(anchor.href).origin === location.origin;
      } catch {
        return false;
      }
    }).length,
    emptyText: anchors.filter(
      (anchor) =>
        !(anchor.textContent ?? '').trim() &&
        !(anchor.querySelector('img[alt]')?.getAttribute('alt') ?? '').trim() &&
        !(anchor.getAttribute('aria-label') ?? '').trim(),
    ).length,
    nofollow: anchors.filter((anchor) =>
      (anchor.getAttribute('rel') ?? '').toLowerCase().includes('nofollow'),
    ).length,
  };

  const jsonLdScripts = [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ];
  const jsonLd = {
    blocks: jsonLdScripts.length,
    invalid: 0,
    types: [] as string[],
    errors: [] as string[],
  };
  for (const script of jsonLdScripts) {
    const raw = (script.textContent ?? '').trim();
    if (!raw) {
      jsonLd.invalid += 1;
      jsonLd.errors.push('Boş JSON-LD bloğu');
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as { '@type'?: string | string[] };
      const type = parsed['@type'];
      const value = Array.isArray(type) ? type.join(', ') : (type ?? '');
      if (value) jsonLd.types.push(value);
    } catch (error) {
      jsonLd.invalid += 1;
      jsonLd.errors.push(
        `Geçersiz JSON: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`,
      );
    }
  }

  return {
    title: document.title.trim(),
    metaDescription: metaContent.get('description') ?? '',
    htmlLang: document.documentElement.getAttribute('lang')?.trim() ?? '',
    canonical:
      (
        document.querySelector(
          'link[rel="canonical"]',
        ) as HTMLLinkElement | null
      )
        ?.getAttribute('href')
        ?.trim() ?? '',
    robots: metaContent.get('robots') ?? '',
    viewportMeta: metaContent.get('viewport') ?? '',
    openGraph,
    twitter,
    headings,
    h1Count: headings.filter((heading) => heading.level === 1).length,
    images: {
      total: images.length,
      missingAlt: missingAlt.length,
      missingAltSelectors: missingAlt.slice(0, 20).map((image) => {
        const parent = image.parentElement;
        const index = parent ? [...parent.children].indexOf(image) + 1 : 1;
        return `img:nth-child(${index})`;
      }),
    },
    links,
    jsonLd,
  } satisfies SeoPageData;
};

export function collectSeo(page: Page): Promise<SeoPageData> {
  return page.evaluate(pageSeoData);
}
