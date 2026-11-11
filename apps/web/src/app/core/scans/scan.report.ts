import type {
  ScanCheck,
  ScanEngineReport,
  ScanFinding,
  ScanJob,
  ScanPageReport,
  ScanResult,
} from '../../../../../../packages/contracts/api';

export const CHECK_STATUS_LABELS: Record<string, string> = {
  passed: 'Geçti',
  failed: 'Sorun bulundu',
  inconclusive: 'Doğrulanamadı',
  skipped: 'Çalıştırılmadı',
};

export const CHECK_CATEGORY_LABELS: Record<string, string> = {
  technical: 'Teknik analiz',
  ui: 'UI analizi',
  ux: 'Erişilebilirlik ve UX',
  accessibility: 'Erişilebilirlik ve kontrast',
  seo: 'SEO',
  performance: 'PageSpeed Insights',
};

/** Rapor bölümleri; her bölüm kendi kontrol ve bulgularını toplar. */
export type ReportSectionId =
  | 'summary'
  | 'technical'
  | 'ui'
  | 'accessibility'
  | 'seo'
  | 'pagespeed'
  | 'screenshots'
  | 'recommendations';

export interface ReportSection {
  id: ReportSectionId;
  label: string;
  description: string;
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    id: 'summary',
    label: 'Genel özet',
    description:
      'Motorların durumu, taranan sayfa sayısı ve bulgu dağılımı özetlenir.',
  },
  {
    id: 'technical',
    label: 'Teknik analiz',
    description:
      'JavaScript hataları, kaynak istekleri, iç bağlantılar ve görseller denetlenir.',
  },
  {
    id: 'ui',
    label: 'UI/UX ve responsive',
    description:
      'Yatay taşma, kırpılan içerik, dokunma hedefleri, odak göstergesi ve kırılma noktası davranışı ölçülür.',
  },
  {
    id: 'accessibility',
    label: 'Erişilebilirlik ve kontrast',
    description:
      'axe-core ile WCAG 2.2 AA kapsamındaki kurallar ve metin kontrastı değerlendirilir.',
  },
  {
    id: 'seo',
    label: 'SEO',
    description:
      'Başlık, meta etiketleri, canonical, robots, Open Graph, Twitter Card ve yapılandırılmış veri denetlenir.',
  },
  {
    id: 'pagespeed',
    label: 'PageSpeed Insights',
    description:
      'Mobil ve masaüstü için Google PageSpeed Insights sonuçları ayrı ayrı gösterilir.',
  },
  {
    id: 'screenshots',
    label: 'Ekran görüntüleri',
    description:
      'Masaüstü ve mobil ekran görüntüleri ile öğe bazlı görsel kanıtlar sunulur.',
  },
  {
    id: 'recommendations',
    label: 'Öncelikli düzeltme önerileri',
    description:
      'Bulgu sayısı ve önem derecesine göre sıralanmış, uygulanabilir öneriler listelenir.',
  },
];

/** Kuralın ait olduğu rapor bölümü. */
export function sectionForRule(rule: string): ReportSectionId {
  if (rule.startsWith('S')) return 'seo';
  if (rule.startsWith('A')) return 'accessibility';
  if (rule.startsWith('U') || rule.startsWith('X')) return 'ui';
  if (rule.startsWith('T')) return 'technical';
  if (rule === 'PAGESPEED') return 'pagespeed';
  return 'technical';
}

export const ENGINE_LABELS: Record<string, string> = {
  technical: 'Teknik analiz',
  ui: 'UI/UX ve responsive',
  accessibility: 'Erişilebilirlik ve kontrast',
  seo: 'SEO',
  pagespeed: 'PageSpeed Insights',
};

export const ENGINE_STATUS_LABELS: Record<string, string> = {
  queued: 'Sırada',
  running: 'Çalışıyor',
  completed: 'Tamamlandı',
  partial: 'Kısmen tamamlandı',
  blocked: 'Engellendi',
  failed: 'Başarısız',
  unavailable: 'Veri alınamadı',
};

export function engineLabel(id: string): string {
  return ENGINE_LABELS[id] ?? id;
}

export function engineStatusLabel(status: string): string {
  return ENGINE_STATUS_LABELS[status] ?? status;
}

/** Motor durumları; yoksa eski kayıtlar için boş liste döner. */
export function engineReports(result: ScanResult | null): ScanEngineReport[] {
  return Array.isArray(result?.engines) ? result.engines : [];
}

/** Bir bölüme ait kontrol kayıtları. */
export function checksForSection(
  checks: ScanCheck[],
  section: ReportSectionId,
): ScanCheck[] {
  if (section === 'summary' || section === 'screenshots') return [];
  if (section === 'pagespeed')
    return checks.filter((check) => check.rule === 'PAGESPEED');
  return checks.filter((check) => sectionForRule(check.rule) === section);
}

/** Bir bölüme ait bulgular. */
export function findingsForSection(
  findings: ScanFinding[],
  section: ReportSectionId,
): ScanFinding[] {
  if (section === 'summary' || section === 'screenshots') return [];
  if (section === 'pagespeed') return [];
  return findings.filter((finding) => sectionForRule(finding.rule) === section);
}

export interface Recommendation {
  rule: string;
  title: string;
  suggestion: string;
  count: number;
  severity: 'error' | 'warning' | 'info';
  pages: string[];
}

/**
 * Öncelikli öneriler: aynı kuraldaki bulgular birleştirilir ve önem
 * derecesi ile bulgu sayısına göre sıralanır.
 */
export function buildRecommendations(
  findings: ScanFinding[],
  limit = 8,
): Recommendation[] {
  const groups = new Map<string, ScanFinding[]>();
  for (const finding of findings) {
    const list = groups.get(finding.rule) ?? [];
    list.push(finding);
    groups.set(finding.rule, list);
  }
  const severityRank = { error: 0, warning: 1, info: 2 } as const;
  return [...groups.values()]
    .map((list) => {
      const first = list[0]!;
      return {
        rule: first.rule,
        title: first.message,
        suggestion: first.suggestion,
        count: list.length,
        severity: list.reduce(
          (worst, item) =>
            severityRank[item.severity] < severityRank[worst]
              ? item.severity
              : worst,
          'info' as 'error' | 'warning' | 'info',
        ),
        pages: [...new Set(list.map((item) => item.url))],
      };
    })
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.count - a.count,
    )
    .slice(0, limit);
}

/** Ekran görüntüsü kayıtları; eski kayıtların base64 görselleri de desteklenir. */
export function pageArtifacts(
  page: ScanPageReport,
): { id: string; url: string; label: string; kind: string }[] {
  const artifacts = page.artifacts ?? [];
  if (artifacts.length)
    return artifacts.map((artifact) => ({
      id: artifact.id,
      url: '',
      label: artifact.label ?? `${artifact.viewport} · ${artifact.kind}`,
      kind: artifact.kind,
    }));
  if (page.screenshot)
    return [
      {
        id: `${page.url}|${page.viewport}`,
        url: `data:image/png;base64,${page.screenshot}`,
        label: `${page.viewport} · eski kayıt`,
        kind: 'page',
      },
    ];
  return [];
}

export interface CheckTotals {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  skipped: number;
}

export function summarizeChecks(checks: ScanCheck[]): CheckTotals {
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

export interface CheckGroup {
  key: string;
  label: string;
  checks: ScanCheck[];
  failed: number;
  passed: number;
  inconclusive: number;
  skipped: number;
}

// Kontroller kategoriye göre gruplanır; grup başlığında durum dağılımı görünür.
export function groupChecks(checks: ScanCheck[]): CheckGroup[] {
  const order = ['technical', 'ui', 'ux', 'performance'];
  const groups = new Map<string, CheckGroup>();
  for (const check of checks) {
    const key = check.category;
    const group = groups.get(key) ?? {
      key,
      label: CHECK_CATEGORY_LABELS[key] ?? key,
      checks: [],
      failed: 0,
      passed: 0,
      inconclusive: 0,
      skipped: 0,
    };
    group.checks.push(check);
    if (check.status === 'failed') group.failed++;
    else if (check.status === 'passed') group.passed++;
    else if (check.status === 'inconclusive') group.inconclusive++;
    else group.skipped++;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );
}

/** Kontrolleri görünüm (masaüstü/mobil) ve kurala göre sıralar. */
export function sortChecks(checks: ScanCheck[]): ScanCheck[] {
  const viewportOrder = { desktop: 0, mobile: 1 } as const;
  return [...checks].sort(
    (a, b) =>
      viewportOrder[a.viewport] - viewportOrder[b.viewport] ||
      a.rule.localeCompare(b.rule),
  );
}

/** Eski kayıtlarda kontrol listesi yoktur; bu durum açıkça bildirilir. */
export function hasCheckResults(result: ScanResult | null): boolean {
  return Array.isArray(result?.checks) && result.checks.length > 0;
}

export const CATEGORY_LABELS: Record<string, string> = {
  technical: 'Teknik',
  ui: 'UI',
  ux: 'UX',
  accessibility: 'Erişilebilirlik',
  seo: 'SEO',
};

export const SEVERITY_LABELS: Record<string, string> = {
  error: 'Hata',
  warning: 'Uyarı',
  info: 'Bilgi',
};

export const RULE_LABELS: Record<string, string> = {
  T01: 'JavaScript hatası',
  T02: 'Başarısız kaynak',
  T03: 'İç bağlantı',
  T04: 'Görsel',
  U02: 'Yatay taşma',
  U04: 'Buton stili',
  U10: 'Viewport dışı içerik',
  U11: 'Kırpılan içerik',
  U12: 'Dokunma hedefi',
  U13: 'Yakın etkileşim öğeleri',
  U14: 'Yazı boyutu',
  U15: 'Erişilebilir isim',
  U16: 'Odak göstergesi',
  U17: 'Responsive bozulma',
  X01: 'Erişilebilir etiket',
  A01: 'axe-core kuralı',
  A02: 'Metin kontrastı',
  A03: 'Büyük metin kontrastı',
  A04: 'Form erişilebilirliği',
  A05: 'ARIA hatası',
  A06: 'Görsel alt metni',
  A07: 'Bağlantı/düğme ismi',
  A08: 'Klavye erişimi',
  S01: 'Sayfa başlığı',
  S02: 'Meta açıklama',
  S03: 'H1 sayısı',
  S04: 'Başlık hiyerarşisi',
  S05: 'Canonical',
  S06: 'Robots meta',
  S07: 'HTML lang',
  S08: 'Viewport meta',
  S09: 'Open Graph',
  S10: 'Twitter Card',
  S11: 'Görsel alt metni',
  S12: 'İç bağlantılar',
  S13: 'HTTP yönlendirme',
  S14: 'JSON-LD',
};

export interface UrlParseResult {
  urls: string[];
  error: string | null;
}

// Tarama öncesi doğrulama: en fazla üç adres, yalnızca http/https, yinelenme yok.
// Adresler sunucudaki normalizasyonla aynı biçimde karşılaştırılır.
export function parseScanUrls(raw: string, max = 3): UrlParseResult {
  const values = raw
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (!values.length) {
    return { urls: [], error: 'En az bir adres girin.' };
  }
  if (values.length > max) {
    return {
      urls: [],
      error: `Tek seferde en fazla ${max} adres taranabilir.`,
    };
  }
  const normalized: string[] = [];
  for (const value of values) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { urls: [], error: `"${value}" geçerli bir adres değil.` };
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return {
        urls: [],
        error: 'Yalnızca http:// veya https:// adresleri taranabilir.',
      };
    }
    if (!url.hostname) {
      return { urls: [], error: `"${value}" geçerli bir adres değil.` };
    }
    url.hash = '';
    const href = url.href;
    if (normalized.includes(href)) {
      return { urls: [], error: 'Aynı adres birden fazla kez eklenemez.' };
    }
    normalized.push(href);
  }
  return { urls: values, error: null };
}

export interface FindingFilters {
  severity: string;
  category: string;
  rule: string;
  query: string;
}

export const emptyFilters = (): FindingFilters => ({
  severity: '',
  category: '',
  rule: '',
  query: '',
});

export function filterFindings<T extends ScanFinding>(
  findings: T[],
  filters: FindingFilters,
): T[] {
  const query = filters.query.trim().toLowerCase();
  return findings.filter((finding) => {
    if (filters.severity && finding.severity !== filters.severity) return false;
    if (filters.category && finding.category !== filters.category) return false;
    if (filters.rule && finding.rule !== filters.rule) return false;
    if (!query) return true;
    return [
      finding.message,
      finding.evidence,
      finding.selector,
      finding.rule,
      finding.suggestion,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

export interface FindingGroup<T extends ScanFinding = ScanFinding> {
  key: string;
  label: string;
  findings: T[];
  errors: number;
  warnings: number;
  infos: number;
}

// Bulgular kategoriye göre gruplanır; grup başlığında sayı ve önem dağılımı görünür.
export function groupFindings<T extends ScanFinding>(
  findings: T[],
): FindingGroup<T>[] {
  const order = ['technical', 'ui', 'ux'];
  const groups = new Map<string, FindingGroup<T>>();
  for (const finding of findings) {
    const key = finding.category;
    const group = groups.get(key) ?? {
      key,
      label: CATEGORY_LABELS[key] ?? key,
      findings: [],
      errors: 0,
      warnings: 0,
      infos: 0,
    };
    group.findings.push(finding);
    if (finding.severity === 'error') group.errors++;
    else if (finding.severity === 'warning') group.warnings++;
    else group.infos++;
    groups.set(key, group);
  }
  const severityRank = { error: 0, warning: 1, info: 2 } as const;
  return [...groups.values()]
    .map((group) => ({
      ...group,
      findings: [...group.findings].sort(
        (a, b) =>
          severityRank[a.severity] - severityRank[b.severity] ||
          a.rule.localeCompare(b.rule),
      ),
    }))
    .sort(
      (a, b) =>
        order.indexOf(a.key) - order.indexOf(b.key) ||
        b.findings.length - a.findings.length,
    );
}

export interface FindingSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  confirmed: number;
  uncertain: number;
}

export function summarizeFindings(findings: ScanFinding[]): FindingSummary {
  const summary: FindingSummary = {
    total: findings.length,
    errors: 0,
    warnings: 0,
    infos: 0,
    confirmed: 0,
    uncertain: 0,
  };
  for (const finding of findings) {
    if (finding.severity === 'error') summary.errors++;
    else if (finding.severity === 'warning') summary.warnings++;
    else summary.infos++;
    if (finding.status === 'confirmed') summary.confirmed++;
    else summary.uncertain++;
  }
  return summary;
}

export interface ScanSummary {
  pages: number;
  analyzedPages: number;
  incompletePages: number;
  findings: FindingSummary;
}

// Tarama özeti yalnızca gerçek analiz edilen sayfalardan hesaplanır.
export function summarizeScan(job: ScanJob | null): ScanSummary {
  const pages: ScanPageReport[] = job?.result?.pages ?? [];
  const analyzed = pages.filter(
    (page) => page.access !== 'blocked' && page.access !== 'unavailable',
  );
  const findings = analyzed.flatMap((page) => page.findings);
  return {
    pages: pages.length,
    analyzedPages: analyzed.length,
    incompletePages: pages.length - analyzed.length,
    findings: summarizeFindings(findings),
  };
}

export function scanStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Kuyrukta';
    case 'running':
      return 'Taranıyor';
    case 'completed':
      return 'Tamamlandı';
    case 'failed':
      return 'Başarısız';
    case 'cancelled':
      return 'İptal edildi';
    default:
      return 'Bilinmiyor';
  }
}

export function scanErrorLabel(code: string | null): string {
  switch (code) {
    case 'TIMEOUT':
      return 'Zaman aşımına uğradı.';
    case 'QUEUE_TIMEOUT':
      return 'Kuyrukta beklerken zaman aşımına uğradı.';
    case 'SERVER_RESTARTED':
      return 'Sunucu yeniden başladığı için tarama kesildi.';
    case 'SERVER_STOPPED':
      return 'Sunucu kapatıldığı için tarama kesildi.';
    case 'SCAN_FAILED':
      return 'Tarama sırasında bir hata oluştu.';
    case null:
      return '';
    default:
      return code;
  }
}

// PageSpeed hata sınıfları: kullanıcı hangi düzeltmenin gerektiğini görür.
export const PAGESPEED_ERROR_LABELS: Record<string, string> = {
  PAGESPEED_QUOTA: 'Kota doldu',
  PAGESPEED_PERMISSION: 'Yetkilendirme reddi',
  PAGESPEED_INVALID_KEY: 'Anahtar geçersiz',
  PAGESPEED_UNAVAILABLE: 'Servis yanıt vermiyor',
  PAGESPEED_TIMEOUT: 'Zaman aşımı',
  PAGESPEED_NETWORK: 'Ağ hatası',
  PAGESPEED_INVALID_RESPONSE: 'Yanıt çözümlenemedi',
};

export function pageSpeedErrorLabel(code: string | undefined): string {
  if (!code) return '';
  return PAGESPEED_ERROR_LABELS[code] ?? code;
}

export const PAGESPEED_STRATEGY_LABELS: Record<string, string> = {
  mobile: 'Mobil',
  desktop: 'Masaüstü',
};

export function pageSpeedStrategyLabel(strategy: string): string {
  return PAGESPEED_STRATEGY_LABELS[strategy] ?? strategy;
}
