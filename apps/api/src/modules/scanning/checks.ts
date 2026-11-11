/**
 * Analiz kontrol sonuçları.
 *
 * Her kural, her sayfa için ayrı bir kontrol kaydı üretir: çalıştı, geçti,
 * sorun bulundu veya çalıştırılamadı. Böylece "bulgu yok" ile "kural
 * çalışmadı" ayrımı veriden anlaşılır.
 */

export type CheckStatus = 'passed' | 'failed' | 'inconclusive' | 'skipped';

export type CheckRule =
  // Teknik analiz
  | 'T01'
  | 'T02'
  | 'T03'
  | 'T04'
  // UI/UX ve responsive
  | 'U02'
  | 'U04'
  | 'U10'
  | 'U11'
  | 'U12'
  | 'U13'
  | 'U14'
  | 'U15'
  | 'U16'
  | 'U17'
  | 'X01'
  // Erişilebilirlik ve kontrast
  | 'A01'
  | 'A02'
  | 'A03'
  | 'A04'
  | 'A05'
  | 'A06'
  | 'A07'
  | 'A08'
  // SEO
  | 'S01'
  | 'S02'
  | 'S03'
  | 'S04'
  | 'S05'
  | 'S06'
  | 'S07'
  | 'S08'
  | 'S09'
  | 'S10'
  | 'S11'
  | 'S12'
  | 'S13'
  | 'S14'
  | 'PAGESPEED';

export type CheckCategory =
  'technical' | 'ui' | 'ux' | 'accessibility' | 'seo' | 'performance';

export interface CheckResult {
  id: string;
  rule: CheckRule;
  title: string;
  category: CheckCategory;
  status: CheckStatus;
  url: string;
  viewport: 'desktop' | 'mobile';
  /** Kontrolün ne yaptığını özetleyen Türkçe metin. */
  message: string;
  /** Ölçüm: kaç öğe incelendi, kaçı sorunlu çıktı. */
  measurement?: string | undefined;
  /** Sorunun kanıtı (başarısız kontrollerde). */
  evidence?: string | undefined;
  /** Sonucun belirsiz veya atlanmış olma nedeni. */
  reason?: string | undefined;
  /** ISO 8601 kontrol zamanı. */
  checkedAt: string;
}

export const CHECK_TITLES: Record<CheckRule, string> = {
  T01: 'JavaScript çalışma zamanı hataları',
  T02: 'Kaynak istekleri',
  T03: 'İç bağlantılar',
  T04: 'Görseller',
  U02: 'Mobil yatay taşma',
  U04: 'Buton stili tutarlılığı',
  U10: 'Viewport dışına çıkan içerik',
  U11: 'Kırpılmış metin ve öğeler',
  U12: 'Dokunma hedefi boyutu',
  U13: 'Birbirine yakın etkileşim öğeleri',
  U14: 'Yazı boyutu',
  U15: 'Etkileşim öğelerinin erişilebilir isimleri',
  U16: 'Odak göstergesi ve klavye erişimi',
  U17: 'Responsive düzen bozulmaları',
  X01: 'Form alanı erişilebilir etiketi',
  A01: 'axe-core WCAG 2.2 AA denetimleri',
  A02: 'Normal metin kontrastı',
  A03: 'Büyük metin kontrastı',
  A04: 'Form erişilebilirliği',
  A05: 'ARIA hataları',
  A06: 'Görsel alternatif metinleri',
  A07: 'Bağlantı ve düğme isimleri',
  A08: 'Klavye ile erişilebilirlik',
  S01: 'Sayfa başlığı (title)',
  S02: 'Meta açıklama',
  S03: 'H1 sayısı',
  S04: 'Başlık hiyerarşisi',
  S05: 'Kanonical adres',
  S06: 'Robots meta etiketi',
  S07: 'HTML lang özniteliği',
  S08: 'Viewport meta etiketi',
  S09: 'Open Graph etiketleri',
  S10: 'Twitter Card etiketi',
  S11: 'Görsel alt metinleri',
  S12: 'İç bağlantı yapısı',
  S13: 'HTTP yönlendirmeleri',
  S14: 'Yapılandırılmış veri (JSON-LD)',
  PAGESPEED: 'PageSpeed Insights',
};

export const CHECK_CATEGORIES: Record<CheckRule, CheckCategory> = {
  T01: 'technical',
  T02: 'technical',
  T03: 'technical',
  T04: 'technical',
  U02: 'ui',
  U04: 'ui',
  U10: 'ui',
  U11: 'ui',
  U12: 'ui',
  U13: 'ui',
  U14: 'ui',
  U15: 'ux',
  U16: 'ux',
  U17: 'ui',
  X01: 'ux',
  A01: 'accessibility',
  A02: 'accessibility',
  A03: 'accessibility',
  A04: 'accessibility',
  A05: 'accessibility',
  A06: 'accessibility',
  A07: 'accessibility',
  A08: 'accessibility',
  S01: 'seo',
  S02: 'seo',
  S03: 'seo',
  S04: 'seo',
  S05: 'seo',
  S06: 'seo',
  S07: 'seo',
  S08: 'seo',
  S09: 'seo',
  S10: 'seo',
  S11: 'seo',
  S12: 'seo',
  S13: 'seo',
  S14: 'seo',
  PAGESPEED: 'performance',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  passed: 'Geçti',
  failed: 'Sorun bulundu',
  inconclusive: 'Doğrulanamadı',
  skipped: 'Çalıştırılmadı',
};

export function checkId(
  rule: CheckRule,
  url: string,
  viewport: string,
): string {
  return `${rule}:${viewport}:${url}`;
}

export function createCheck(input: {
  rule: CheckRule;
  status: CheckStatus;
  url: string;
  viewport: 'desktop' | 'mobile';
  message: string;
  measurement?: string | undefined;
  evidence?: string | undefined;
  reason?: string | undefined;
  checkedAt?: string | undefined;
}): CheckResult {
  return {
    id: checkId(input.rule, input.url, input.viewport),
    rule: input.rule,
    title: CHECK_TITLES[input.rule],
    category: CHECK_CATEGORIES[input.rule],
    status: input.status,
    url: input.url,
    viewport: input.viewport,
    message: input.message,
    measurement: input.measurement,
    evidence: input.evidence,
    reason: input.reason,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  };
}

export interface CheckTotals {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  skipped: number;
}

export function summarizeChecks(checks: CheckResult[]): CheckTotals {
  const totals: CheckTotals = {
    total: checks.length,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    skipped: 0,
  };
  for (const check of checks) {
    if (check.status === 'passed') totals.passed++;
    else if (check.status === 'failed') totals.failed++;
    else if (check.status === 'inconclusive') totals.inconclusive++;
    else totals.skipped++;
  }
  return totals;
}
