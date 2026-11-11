import { createHash } from 'node:crypto';
import type { PageAccess } from './access.js';

export type Rule =
  // Teknik
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
  // Erişilebilirlik
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
  | 'S14';

export type FindingCategory =
  'technical' | 'ui' | 'ux' | 'accessibility' | 'seo';

export type { PageAccess };

export interface Finding {
  id: string;
  rule: Rule;
  category: FindingCategory;
  severity: 'error' | 'warning' | 'info';
  confidence: 'high' | 'medium' | 'low';
  url: string;
  selector: string;
  message: string;
  suggestion: string;
  evidence: string;
  status: 'confirmed' | 'uncertain';
  /** Farklı motorların aynı sorunu üretmemesi için ortak anahtar. */
  dedupeKey?: string;
}

interface RuleMeta {
  category: FindingCategory;
  severity: 'error' | 'warning' | 'info';
  confidence: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

const RULE_META: Record<Rule, RuleMeta> = {
  T01: {
    category: 'technical',
    severity: 'error',
    confidence: 'high',
    message: 'JavaScript çalışma zamanı hatası',
    suggestion: 'Hata kaynağını ve çağrı zincirini inceleyin.',
  },
  T02: {
    category: 'technical',
    severity: 'error',
    confidence: 'high',
    message: 'Başarısız kaynak isteği',
    suggestion: 'HTTP yanıtını ve ağ yapılandırmasını kontrol edin.',
  },
  T03: {
    category: 'technical',
    severity: 'error',
    confidence: 'high',
    message: 'İç bağlantı doğrulaması',
    suggestion: 'Bağlantı hedefini ve yönlendirmeleri kontrol edin.',
  },
  T04: {
    category: 'technical',
    severity: 'error',
    confidence: 'high',
    message: 'Görsel yüklenemedi',
    suggestion: 'Görsel adresini ve dosyasını kontrol edin.',
  },
  U02: {
    category: 'ui',
    severity: 'error',
    confidence: 'high',
    message: 'Mobil yatay taşma',
    suggestion: 'Sabit genişlikleri ve taşan elemanı inceleyin.',
  },
  U04: {
    category: 'ui',
    severity: 'warning',
    confidence: 'medium',
    message: 'Benzer butonlarda stil farkı',
    suggestion: 'Farkın kasıtlı bir varyant olup olmadığını inceleyin.',
  },
  U10: {
    category: 'ui',
    severity: 'warning',
    confidence: 'high',
    message: 'Viewport dışına çıkan içerik',
    suggestion: 'Sabit genişlikli öğeleri ve taşan kapsayıcıları düzenleyin.',
  },
  U11: {
    category: 'ui',
    severity: 'warning',
    confidence: 'high',
    message: 'Kırpılmış metin veya öğe',
    suggestion:
      'overflow değerini düzenleyin; içeriğin tamamının görünmesini sağlayın.',
  },
  U12: {
    category: 'ui',
    severity: 'warning',
    confidence: 'high',
    message: 'Dokunma hedefi çok küçük',
    suggestion:
      'Hedefi en az 24×24 CSS piksele büyütün; mobilde 44×44 önerilir.',
  },
  U13: {
    category: 'ui',
    severity: 'warning',
    confidence: 'medium',
    message: 'Etkileşim öğeleri çok yakın',
    suggestion: 'Hedefler arasında en az 8 piksel boşluk bırakın.',
  },
  U14: {
    category: 'ui',
    severity: 'warning',
    confidence: 'medium',
    message: 'Yazı boyutu çok küçük',
    suggestion: 'Metin boyutunu en az 12 CSS piksele çıkarın.',
  },
  U15: {
    category: 'ux',
    severity: 'warning',
    confidence: 'high',
    message: 'Etkileşim öğesinin erişilebilir adı yok',
    suggestion:
      'Düğmeye ve bağlantıya metin, aria-label veya aria-labelledby verin.',
  },
  U16: {
    category: 'ux',
    severity: 'warning',
    confidence: 'medium',
    message: 'Odak göstergesi görünmüyor',
    suggestion:
      'Odak durumunda görünür bir kenar veya arka plan değişikliği tanımlayın.',
  },
  U17: {
    category: 'ui',
    severity: 'warning',
    confidence: 'high',
    message: 'Responsive düzen bozuldu',
    suggestion: 'Sabit genişlikleri kırılma noktalarına göre düzenleyin.',
  },
  X01: {
    category: 'ux',
    severity: 'error',
    confidence: 'high',
    message: 'Form alanının erişilebilir etiketi eksik',
    suggestion:
      'Alanı label, aria-label veya geçerli aria-labelledby ile adlandırın.',
  },
  A01: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Otomatik erişilebilirlik kuralı ihlali',
    suggestion:
      'İhlali giderin; otomatik testler WCAG kriterlerinin yalnızca bir bölümünü kapsar.',
  },
  A02: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Metin kontrastı yetersiz',
    suggestion: 'Metin ve arka plan arasındaki oranı en az 4.5:1 yapın.',
  },
  A03: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Büyük metin kontrastı yetersiz',
    suggestion: 'Büyük metin için kontrast oranını en az 3:1 yapın.',
  },
  A04: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Form erişilebilirliği hatası',
    suggestion:
      'Alanları etiketleyin ve hata mesajlarını aria-describedby ile bağlayın.',
  },
  A05: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'ARIA hatası',
    suggestion: 'Geçersiz ARIA rolü, özniteliği veya ilişkiyi düzeltin.',
  },
  A06: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Görselin alternatif metni eksik',
    suggestion: 'Her görsele açıklayıcı bir alt metin verin.',
  },
  A07: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Bağlantı veya düğme adı eksik',
    suggestion: 'Bağlantı ve düğmelere erişilebilir bir ad verin.',
  },
  A08: {
    category: 'accessibility',
    severity: 'error',
    confidence: 'high',
    message: 'Klavye erişilebilirliği hatası',
    suggestion:
      'Öğeleri klavyeyle erişilebilir hâle getirin ve odak sırasını düzenleyin.',
  },
  S01: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Sayfa başlığı eksik veya uygun değil',
    suggestion:
      'Tek ve açıklayıcı bir title ekleyin (önerilen 30-60 karakter; sıralama garantisi değildir).',
  },
  S02: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Meta açıklama eksik veya uygun değil',
    suggestion:
      'Sayfayı özetleyen bir meta description ekleyin (önerilen 50-160 karakter; sıralama garantisi değildir).',
  },
  S03: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'H1 sayısı uygun değil',
    suggestion: 'Sayfada tam bir tane H1 başlık bulunsun.',
  },
  S04: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Başlık hiyerarşisi bozuk',
    suggestion: 'Başlık seviyelerini atlamadan sıralayın.',
  },
  S05: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Kanonical adres eksik',
    suggestion: 'Kendi kendini referanslayan bir canonical etiketi ekleyin.',
  },
  S06: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Robots meta etiketi eksik',
    suggestion: 'meta robots ile dizine ekleme davranışını açıkça belirtin.',
  },
  S07: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'HTML lang özniteliği eksik',
    suggestion: '<html lang="tr"> gibi bir dil özniteliği ekleyin.',
  },
  S08: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Viewport meta etiketi eksik',
    suggestion: 'width=device-width içeren bir viewport etiketi ekleyin.',
  },
  S09: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Open Graph etiketleri eksik',
    suggestion:
      'og:title, og:description, og:image ve og:url etiketlerini ekleyin.',
  },
  S10: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Twitter Card etiketi eksik',
    suggestion: 'twitter:card etiketini ekleyin.',
  },
  S11: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Görsel alt metni eksik',
    suggestion: 'Görsellere açıklayıcı alt metin verin.',
  },
  S12: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'İç bağlantı yapısı uygun değil',
    suggestion:
      'Anlamlı bağlantı metinleri kullanın ve iç bağlantıyı güçlendirin.',
  },
  S13: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'HTTP yönlendirmesi kullanılıyor',
    suggestion:
      'Kalıcı yönlendirme (301) kullanın veya gereksiz yönlendirmeyi kaldırın.',
  },
  S14: {
    category: 'seo',
    severity: 'warning',
    confidence: 'high',
    message: 'Yapılandırılmış veri geçersiz',
    suggestion: 'JSON-LD bloğunu geçerli JSON olarak düzeltin.',
  },
};

export interface PageReport {
  url: string;
  viewport: 'desktop' | 'mobile';
  complete: boolean;
  findings: Finding[];
  error?: string;
  // 'ok' when the page was analyzed, 'blocked' when access was denied by the
  // site or a protection layer, 'unavailable' when the page could not be read.
  access?: PageAccess;
  // Human readable explanation of the state, shown in the result screen.
  statusMessage?: string;
  screenshot?: string;
  consoleErrors?: string[];
  /** Sayfaya bağlı ekran görüntüsü kayıtları (dosya deposundan servis edilir). */
  artifacts?: ArtifactRef[];
}

/** Ekran görüntüsü kaydının sözleşmesi. */
export interface ArtifactRef {
  id: string;
  kind: 'page' | 'element';
  viewport: 'desktop' | 'mobile';
  url: string;
  label?: string | undefined;
  selector?: string | undefined;
  bytes: number;
  width?: number | undefined;
  height?: number | undefined;
}

export function finding(
  rule: Rule,
  url: string,
  selector: string,
  evidence: string,
  uncertain = false,
  dedupeKey?: string,
): Finding {
  const meta = RULE_META[rule];
  const id = createHash('sha256')
    .update(JSON.stringify([rule, url, selector, evidence]))
    .digest('hex');
  return {
    id,
    rule,
    category: meta.category,
    severity: uncertain ? 'info' : meta.severity,
    confidence: uncertain ? 'low' : meta.confidence,
    url,
    selector,
    evidence: evidence.slice(0, 2000),
    message: meta.message,
    suggestion: meta.suggestion,
    status: uncertain ? 'uncertain' : 'confirmed',
    ...(dedupeKey ? { dedupeKey } : {}),
  };
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * Aynı sorun birden fazla motordan geldiğinde kullanıcıya bir kez gösterilir.
 * Yalnızca ortak `dedupeKey` taşıyan bulgular birleştirilir; diğerleri
 * kural+görünüm+adres+kanıt kimliğiyle ayrı kalır.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const item of findings) {
    const key = item.dedupeKey ?? item.id;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const result: Finding[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence],
    );
    const primary = sorted[0]!;
    const extra = sorted
      .slice(1)
      .map((item) => item.evidence)
      .filter(
        (evidence) =>
          evidence &&
          evidence !== primary.evidence &&
          !primary.evidence.includes(evidence),
      );
    result.push(
      extra.length
        ? {
            ...primary,
            evidence: `${primary.evidence} | ${extra.join(' | ')}`.slice(
              0,
              2000,
            ),
          }
        : primary,
    );
  }
  return result;
}

export function compareReports(before: PageReport[], after: PageReport[]) {
  const identity = (f: Finding) => JSON.stringify([f.rule, f.url, f.selector]);
  const old = new Map(
    before.flatMap((p) => p.findings).map((f) => [identity(f), f]),
  );
  const current = new Map(
    after.flatMap((p) => p.findings).map((f) => [identity(f), f]),
  );
  const complete = new Set(
    after.filter((p) => p.complete).map((p) => `${p.url}|${p.viewport}`),
  );
  const resolved: Finding[] = [];
  const unverified: Finding[] = [];
  for (const [key, f] of old)
    if (!current.has(key)) {
      const pages = before.filter((p) =>
        p.findings.some((x) => identity(x) === key),
      );
      (pages.every((p) => complete.has(`${p.url}|${p.viewport}`))
        ? resolved
        : unverified
      ).push(f);
    }
  return {
    added: [...current].filter(([k]) => !old.has(k)).map(([, v]) => v),
    continuing: [...current].filter(([k]) => old.has(k)).map(([, v]) => v),
    resolved,
    unverified,
  };
}
