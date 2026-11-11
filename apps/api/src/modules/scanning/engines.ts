import {
  createCheck,
  type CheckResult,
  type CheckRule,
  type CheckStatus,
} from './checks.js';
import { finding, type Finding } from './findings.js';
import { evaluateContrast } from './contrast.js';
import type { ContrastSample } from './contrast.rules.js';
import {
  FORM_LABEL_RULES,
  NAME_RULES,
  type AxeRunResult,
  type AxeViolation,
} from './accessibility.js';
import type { UxMeasurements } from './ux.rules.js';
import type { SeoPageData } from './seo.rules.js';

/**
 * Motor değerlendirmeleri.
 *
 * Sayfa içi betikler yalnızca ham ölçüm toplar; "geçti/başarısız" kararı ve
 * düzeltme önerileri burada üretilir. Böylece eşik değerleri tek yerde durur
 * ve otomatik testlerle doğrulanabilir.
 */

export interface EngineContext {
  url: string;
  viewport: 'desktop' | 'mobile';
  checkedAt?: string | undefined;
}

export interface EngineOutcome {
  checks: CheckResult[];
  findings: Finding[];
}

const check = (
  ctx: EngineContext,
  rule: CheckRule,
  status: CheckStatus,
  message: string,
  extra: {
    measurement?: string | undefined;
    evidence?: string | undefined;
    reason?: string | undefined;
  } = {},
): CheckResult =>
  createCheck({
    rule,
    status,
    url: ctx.url,
    viewport: ctx.viewport,
    message,
    ...extra,
    ...(ctx.checkedAt ? { checkedAt: ctx.checkedAt } : {}),
  });

const findingFor = (
  ctx: EngineContext,
  rule: CheckRule,
  selector: string,
  evidence: string,
  dedupeKey?: string,
): Finding =>
  finding(
    rule as Parameters<typeof finding>[0],
    ctx.url,
    selector,
    evidence,
    false,
    dedupeKey,
  );

// ---------------------------------------------------------------------------
// UI/UX ve responsive
// ---------------------------------------------------------------------------

export function evaluateUx(
  measurements: UxMeasurements,
  ctx: EngineContext,
  options: {
    /** axe-core'un işaretlediği küçük hedefler; çift kayıt önlenir. */
    extraTouchTargets?: { selector: string; evidence: string }[] | undefined;
    /** axe-core'un bulduğu adı olmayan bağlantı/düğme sayısı. */
    extraUnnamedControls?: number | undefined;
  } = {},
): EngineOutcome {
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  const { viewport } = measurements;
  const pageOverflow = viewport.scrollWidth > viewport.clientWidth + 2;

  if (ctx.viewport !== 'mobile') {
    checks.push(
      check(
        ctx,
        'U02',
        'skipped',
        'Kural yalnızca mobil görünümde uygulanır.',
        {
          reason: 'Masaüstü görünümünde yatay taşma ölçülmez.',
        },
      ),
    );
  } else if (pageOverflow) {
    checks.push(
      check(ctx, 'U02', 'failed', 'Sayfayı yatay taşıran öğe bulundu.', {
        measurement: `sayfa ${viewport.scrollWidth}px, görünüm ${viewport.clientWidth}px`,
        evidence: measurements.overflowElements
          .slice(0, 3)
          .map((item) => `${item.selector} (sağ ${item.right}px)`)
          .join(' | '),
      }),
    );
    for (const item of measurements.overflowElements.slice(0, 10)) {
      findings.push(
        findingFor(
          ctx,
          'U02',
          item.selector,
          `Sol ${item.left}px, sağ ${item.right}px, genişlik ${item.width}px; görünüm ${viewport.clientWidth}px.`,
          `overflow:${item.selector}`,
        ),
      );
    }
  } else {
    checks.push(
      check(ctx, 'U02', 'passed', 'Mobil görünümde yatay taşma ölçülmedi.', {
        measurement: `sayfa ${viewport.scrollWidth}px, görünüm ${viewport.clientWidth}px`,
      }),
    );
  }

  // Sayfa yatay kaymıyorsa bile görünümün dışına taşan öğeler ayrı raporlanır.
  if (!pageOverflow) {
    if (measurements.overflowElements.length) {
      checks.push(
        check(ctx, 'U10', 'failed', 'Görünümün dışına taşan içerik bulundu.', {
          measurement: `${measurements.overflowElements.length} öğe görünüm sınırının dışında`,
          evidence: measurements.overflowElements
            .slice(0, 3)
            .map((item) => `${item.selector} (sağ ${item.right}px)`)
            .join(' | '),
        }),
      );
      for (const item of measurements.overflowElements.slice(0, 10)) {
        findings.push(
          findingFor(
            ctx,
            'U10',
            item.selector,
            `Sol ${item.left}px, sağ ${item.right}px; görünüm ${viewport.clientWidth}px.`,
            `viewport-overflow:${item.selector}`,
          ),
        );
      }
    } else {
      checks.push(
        check(
          ctx,
          'U10',
          'passed',
          'Görünümün dışına taşan içerik bulunmadı.',
          {
            measurement: `${measurements.analyzedElements} öğe incelendi`,
          },
        ),
      );
    }
  } else {
    checks.push(
      check(ctx, 'U10', 'skipped', 'Yatay taşma U02 kuralında raporlandı.', {
        reason: 'Sayfa yatay kaydığı için öğe bazlı taşma ayrıca raporlanmadı.',
      }),
    );
  }

  if (measurements.clippedElements.length) {
    checks.push(
      check(ctx, 'U11', 'failed', 'Kırpılan metin veya öğe bulundu.', {
        measurement: `${measurements.clippedElements.length} öğe içeriği kırpılmış`,
        evidence: measurements.clippedElements
          .slice(0, 3)
          .map(
            (item) =>
              `${item.selector} (${item.axis} ekseni, ${item.hidden}px gizli)`,
          )
          .join(' | '),
      }),
    );
    for (const item of measurements.clippedElements.slice(0, 10)) {
      findings.push(
        findingFor(
          ctx,
          'U11',
          item.selector,
          `${item.axis} ekseninde ${item.hidden}px içerik gizleniyor.`,
        ),
      );
    }
  } else {
    checks.push(
      check(ctx, 'U11', 'passed', 'Kırpılan içerik bulunmadı.', {
        measurement: `${measurements.analyzedElements} öğe incelendi`,
      }),
    );
  }

  const { checked, belowMinimum, belowRecommended } = measurements.touchTargets;
  const extraTouchTargets = options.extraTouchTargets ?? [];
  if (!checked && !extraTouchTargets.length) {
    checks.push(
      check(ctx, 'U12', 'skipped', 'Etkileşim öğesi bulunamadı.', {
        measurement: '0 etkileşim öğesi',
        reason: 'Sayfada tıklanabilir öğe bulunamadı.',
      }),
    );
  } else if (belowMinimum.length || extraTouchTargets.length) {
    checks.push(
      check(
        ctx,
        'U12',
        'failed',
        'Dokunma hedefi çok küçük olan öğeler bulundu.',
        {
          measurement: `${checked} etkileşim öğesi incelendi${extraTouchTargets.length ? `, axe-core ${extraTouchTargets.length} küçük hedef bildirdi` : ''}, ${belowMinimum.length + extraTouchTargets.length} tanesi 24×24 pikselin altında${belowRecommended.length ? `, ${belowRecommended.length} tanesi 44×44 pikselin altında` : ''}`,
          evidence: [
            ...belowMinimum
              .slice(0, 2)
              .map(
                (item) => `${item.selector} (${item.width}×${item.height}px)`,
              ),
            ...extraTouchTargets
              .slice(0, 2)
              .map((item) => `${item.selector}: ${item.evidence}`),
          ].join(' | '),
          ...(belowRecommended.length
            ? {
                reason:
                  'WCAG 2.5.8 yalnızca 24×24 piksel zorunluluğu getirir; 44×44 mobil önerisidir.',
              }
            : {}),
        },
      ),
    );
    for (const item of belowMinimum.slice(0, 10)) {
      findings.push(
        findingFor(
          ctx,
          'U12',
          item.selector,
          `Hedef ${item.width}×${item.height}px; WCAG 2.5.8 için en az 24×24px gerekir.`,
        ),
      );
    }
  } else {
    checks.push(
      check(ctx, 'U12', 'passed', 'Tüm dokunma hedefleri yeterince büyük.', {
        measurement: `${checked} etkileşim öğesi incelendi${belowRecommended.length ? `, ${belowRecommended.length} tanesi 44×44 pikselin altında (öneri)` : ''}`,
        ...(belowRecommended.length
          ? {
              reason:
                'WCAG 2.5.8 yalnızca 24×24 piksel zorunluluğu getirir; 44×44 mobil önerisidir.',
            }
          : {}),
      }),
    );
  }

  if (measurements.adjacentTargets.length) {
    checks.push(
      check(
        ctx,
        'U13',
        'failed',
        'Birbirine çok yakın etkileşim öğeleri bulundu.',
        {
          measurement: `${measurements.adjacentTargets.length} çift 2 pikselden az boşlukla yan yana`,
          evidence: measurements.adjacentTargets
            .slice(0, 3)
            .map((item) => `${item.first} | ${item.second} (${item.gap}px)`)
            .join(' | '),
        },
      ),
    );
    for (const item of measurements.adjacentTargets.slice(0, 10)) {
      findings.push(
        findingFor(
          ctx,
          'U13',
          item.first,
          `${item.second} öğesiyle ${item.gap}px boşlukta; yanlış dokunma riski var.`,
        ),
      );
    }
  } else {
    checks.push(
      check(
        ctx,
        'U13',
        'passed',
        'Etkileşim öğeleri arasında yeterli boşluk var.',
        {
          measurement: 'çakışan veya bitişik hedef çifti bulunmadı',
        },
      ),
    );
  }

  if (measurements.smallText.length) {
    checks.push(
      check(ctx, 'U14', 'failed', 'Okunamayacak kadar küçük metin bulundu.', {
        measurement: `${measurements.smallText.length} metin öğesi 12 pikselin altında`,
        evidence: measurements.smallText
          .slice(0, 3)
          .map((item) => `${item.selector} (${item.fontSize}px)`)
          .join(' | '),
      }),
    );
    for (const item of measurements.smallText.slice(0, 10)) {
      findings.push(
        findingFor(
          ctx,
          'U14',
          item.selector,
          `Yazı boyutu ${item.fontSize}px; okunabilirlik için en az 12px önerilir.`,
        ),
      );
    }
  } else {
    checks.push(
      check(ctx, 'U14', 'passed', 'Metin boyutları okunabilir aralıkta.', {
        measurement: '12 pikselin altında metin bulunmadı',
      }),
    );
  }

  const axeUnnamed = options.extraUnnamedControls ?? 0;
  if (measurements.unnamedControls.length || axeUnnamed) {
    checks.push(
      check(
        ctx,
        'U15',
        'failed',
        'Erişilebilir adı olmayan etkileşim öğesi bulundu.',
        {
          measurement: `${measurements.unnamedControls.length + axeUnnamed} öğenin erişilebilir adı yok${axeUnnamed ? ` (axe-core ${axeUnnamed} öğeyi işaretledi)` : ''}`,
          evidence: [
            ...measurements.unnamedControls
              .slice(0, 2)
              .map((item) => `${item.tag}: ${item.selector}`),
          ].join(' | '),
        },
      ),
    );
    for (const item of measurements.unnamedControls.slice(0, 10)) {
      findings.push(
        findingFor(
          ctx,
          'U15',
          item.selector,
          `${item.tag} öğesinde metin, aria-label, aria-labelledby, title veya value bulunamadı.`,
          `accessible-name:${item.selector}`,
        ),
      );
    }
  } else {
    checks.push(
      check(
        ctx,
        'U15',
        'passed',
        'Etkileşim öğelerinin erişilebilir adı var.',
        {
          measurement: 'erişilebilir adı eksik öğe bulunmadı',
        },
      ),
    );
  }

  const { checked: focusChecked, missing: focusMissing } =
    measurements.focusIndicators;
  const focusIssues = [
    ...measurements.focusOrder.map((item) => ({
      selector: item.selector,
      detail: `tabindex=${item.tabindex}; pozitif tabindex doğal odak sırasını bozar.`,
    })),
    ...measurements.hiddenFocusable.map((item) => ({
      selector: item.selector,
      detail: `Odaklanabilir öğe gizli: ${item.reason}.`,
    })),
  ];
  if (focusMissing.length || focusIssues.length) {
    checks.push(
      check(
        ctx,
        'U16',
        'failed',
        'Klavye erişimi veya odak göstergesi sorunu bulundu.',
        {
          measurement: `${focusChecked} odaklanabilir öğe denendi, ${focusMissing.length} tanesinde odak göstergesi yok, ${focusIssues.length} tanesinde odak sırası sorunu var`,
          evidence: [
            ...focusMissing
              .slice(0, 2)
              .map((item) => `${item.selector}: odak göstergesi yok`),
            ...focusIssues
              .slice(0, 2)
              .map((item) => `${item.selector}: ${item.detail}`),
          ].join(' | '),
        },
      ),
    );
    for (const item of focusMissing.slice(0, 8)) {
      findings.push(
        findingFor(
          ctx,
          'U16',
          item.selector,
          'Öğe odaklandığında kenar, gölge, çerçeve veya arka plan değişmedi.',
        ),
      );
    }
    for (const item of focusIssues.slice(0, 8)) {
      findings.push(
        findingFor(
          ctx,
          'U16',
          item.selector,
          item.detail,
          `focus-order:${item.selector}`,
        ),
      );
    }
  } else {
    checks.push(
      check(
        ctx,
        'U16',
        'passed',
        'Odak göstergeleri görünür ve odak sırası doğru.',
        {
          measurement: `${focusChecked} odaklanabilir öğe denendi`,
        },
      ),
    );
  }

  return { checks, findings };
}

// ---------------------------------------------------------------------------
// Renk kontrastı
// ---------------------------------------------------------------------------

export function evaluateContrastSamples(
  samples: ContrastSample[],
  ctx: EngineContext,
  options: { emitChecks?: boolean } = {},
): EngineOutcome {
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  const emitChecks = options.emitChecks ?? true;
  let measured = 0;
  let normalFailures = 0;
  let largeFailures = 0;
  let inconclusive = 0;

  for (const sample of samples) {
    if (sample.hasBackgroundImage) {
      inconclusive += 1;
      continue;
    }
    const result = evaluateContrast({
      foreground: sample.color,
      backgroundLayers: sample.backgroundLayers,
      fontSizePx: sample.fontSize,
      fontWeight: sample.fontWeight,
    });
    if (!result) {
      inconclusive += 1;
      continue;
    }
    measured += 1;
    if (result.passes) continue;
    const rule = result.largeText ? 'A03' : 'A02';
    if (result.largeText) largeFailures += 1;
    else normalFailures += 1;
    findings.push(
      findingFor(
        ctx,
        rule,
        sample.selector,
        `Oran ${result.ratio}:1, gereken ${result.required}:1. Metin ${result.foregroundHex}, arka plan ${result.backgroundHex}. "${sample.text}"`,
        `contrast:${sample.selector}`,
      ),
    );
  }

  const total = normalFailures + largeFailures;
  void total;
  if (!measured) {
    if (!emitChecks) return { checks, findings };
    checks.push(
      check(ctx, 'A02', 'inconclusive', 'Ölçülebilir metin bulunamadı.', {
        measurement: '0 metin öğesi ölçülebildi',
        reason:
          'Metin renkleri veya arka plan katmanları okunamadı; kontrast hesaplanamadı.',
      }),
    );
    checks.push(
      check(ctx, 'A03', 'skipped', 'Büyük metin ölçümü yapılamadı.', {
        reason:
          'Metin ölçümü yapılamadığı için büyük metin kontrastı da hesaplanamadı.',
      }),
    );
    return { checks, findings };
  }

  if (emitChecks) {
    checks.push(
      check(
        ctx,
        'A02',
        normalFailures ? 'failed' : 'passed',
        normalFailures
          ? 'Normal metin kontrastı yetersiz olan öğeler bulundu.'
          : 'Normal metin kontrastı yeterli.',
        {
          measurement: `${measured} metin öğesi ölçüldü, ${normalFailures} tanesi 4.5:1 altında${inconclusive ? `, ${inconclusive} öğe arka plan görseli nedeniyle hesaplanamadı` : ''}`,
          ...(normalFailures
            ? {
                evidence: findings
                  .filter((item) => item.rule === 'A02')
                  .slice(0, 3)
                  .map((item) => item.evidence)
                  .join(' | '),
              }
            : {}),
          ...(inconclusive
            ? {
                reason:
                  'Arka plan görseli üzerinde kontrast güvenilir ölçülemez; bu öğeler doğrulanamadı sayılır.',
              }
            : {}),
        },
      ),
    );
    checks.push(
      check(
        ctx,
        'A03',
        largeFailures ? 'failed' : 'passed',
        largeFailures
          ? 'Büyük metin kontrastı yetersiz olan öğeler bulundu.'
          : 'Büyük metin kontrastı yeterli.',
        {
          measurement: `${largeFailures} büyük metin öğesi 3:1 altında`,
          ...(largeFailures
            ? {
                evidence: findings
                  .filter((item) => item.rule === 'A03')
                  .slice(0, 3)
                  .map((item) => item.evidence)
                  .join(' | '),
              }
            : {}),
        },
      ),
    );
  }
  return { checks, findings };
}

// ---------------------------------------------------------------------------
// axe-core
// ---------------------------------------------------------------------------

const AXE_FORM_RULES = [
  ...FORM_LABEL_RULES,
  'autocomplete-valid',
  'input-button-name',
];

const AXE_NAME_RULES = [
  ...NAME_RULES,
  'aria-toggle-field-name',
  'aria-meter-name',
  'aria-progressbar-name',
];

const AXE_KEYBOARD_RULES = [
  'bypass',
  'frame-focusable-content',
  'hidden-focus',
  'focus-order-semantics',
  'focus-visible',
  'keyboard',
];

const AXE_RULE_GROUPS: { rule: CheckRule; label: string; ids: string[] }[] = [
  { rule: 'A04', label: 'Form erişilebilirliği', ids: AXE_FORM_RULES },
  { rule: 'A05', label: 'ARIA kuralları', ids: [] },
  { rule: 'A06', label: 'Görsel alternatif metinleri', ids: ['image-alt'] },
  { rule: 'A07', label: 'Bağlantı ve düğme isimleri', ids: AXE_NAME_RULES },
  { rule: 'A08', label: 'Klavye erişilebilirliği', ids: AXE_KEYBOARD_RULES },
];

export function evaluateAxe(
  result: AxeRunResult,
  ctx: EngineContext,
): EngineOutcome {
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  if (!result.available) {
    for (const rule of ['A01', ...AXE_RULE_GROUPS.map((group) => group.rule)]) {
      checks.push(
        check(ctx, rule as CheckRule, 'skipped', 'axe-core çalıştırılamadı.', {
          reason: result.error ?? 'axe-core sonucu alınamadı.',
        }),
      );
    }
    return { checks, findings };
  }

  const general: AxeViolation[] = [];
  const grouped = new Map<CheckRule, AxeViolation[]>();
  const contrastViolations: AxeViolation[] = [];

  for (const violation of result.violations) {
    if (violation.id === 'color-contrast') {
      contrastViolations.push(violation);
      continue;
    }
    // Bulgu hangi Nabız kuralına aitse oraya yazılır; kontrol grupları ise
    // axe kuralının konusunu gösterir.
    const rule = axeCategory(violation.id);
    if (rule === 'A01') general.push(violation);
    else {
      const list = grouped.get(rule) ?? [];
      list.push(violation);
      grouped.set(rule, list);
    }
    if (
      violation.id.startsWith('aria-') &&
      !AXE_NAME_RULES.includes(violation.id)
    ) {
      const list = grouped.get('A05') ?? [];
      list.push(violation);
      grouped.set('A05', list);
    }
  }

  const nodeCount = (list: AxeViolation[]) =>
    list.reduce((sum, violation) => sum + violation.nodes.length, 0);

  checks.push(
    check(
      ctx,
      'A01',
      general.length ? 'failed' : 'passed',
      general.length
        ? 'Genel erişilebilirlik kurallarında ihlal bulundu.'
        : 'Genel erişilebilirlik kurallarında ihlal bulunmadı.',
      {
        measurement: `axe-core WCAG 2.2 AA kuralları çalıştırıldı, ${general.length} kural ihlal verdi, ${nodeCount(general)} düğüm etkilendi${result.incomplete ? `, ${result.incomplete} düğüm denetlenemedi` : ''}`,
        ...(general.length
          ? {
              evidence: general
                .slice(0, 3)
                .map((violation) => `${violation.id}: ${violation.help}`)
                .join(' | '),
            }
          : {}),
        ...(result.incomplete
          ? {
              reason:
                'Otomatik testler her koşulu ölçemez; denetlenemeyen düğümler başarı olarak sayılmaz.',
            }
          : {}),
      },
    ),
  );

  for (const group of AXE_RULE_GROUPS) {
    const list =
      grouped.get(group.rule) ??
      result.violations.filter((violation) => group.ids.includes(violation.id));
    checks.push(
      check(
        ctx,
        group.rule,
        list.length ? 'failed' : 'passed',
        list.length
          ? `${group.label} kurallarında ihlal bulundu.`
          : `${group.label} kurallarında ihlal bulunmadı.`,
        {
          measurement: `${list.length} kural ihlal verdi, ${nodeCount(list)} düğüm etkilendi`,
          ...(list.length
            ? {
                evidence: list
                  .slice(0, 3)
                  .map((violation) => `${violation.id}: ${violation.help}`)
                  .join(' | '),
              }
            : {}),
        },
      ),
    );
  }

  for (const violation of result.violations) {
    for (const node of violation.nodes.slice(0, 8)) {
      const selector = node.target.join(' ');
      const data = node.any?.[0]?.data ?? {};
      const ratio = data['contrastRatio'];
      const expected = data['expectedContrastRatio'];
      const fg = data['fgColor'];
      const bg = data['bgColor'];
      // Büyük metin 3:1 eşiğine tabidir; diğer metin 4.5:1.
      const isLarge =
        expected !== undefined && Number.parseFloat(String(expected)) === 3;
      const rule =
        violation.id === 'color-contrast'
          ? isLarge
            ? 'A03'
            : 'A02'
          : axeCategory(violation.id);
      const evidence =
        violation.id === 'color-contrast'
          ? [
              node.failureSummary,
              ratio !== undefined
                ? `Oran ${ratio}:1 (gereken ${expected ?? '?'}:1)`
                : '',
              fg ? `Metin ${fg}` : '',
              bg ? `arka plan ${bg}` : '',
            ]
              .filter(Boolean)
              .join(' | ') || violation.description
          : [node.failureSummary ?? violation.help, node.html.slice(0, 200)]
              .filter(Boolean)
              .join(' | ');
      findings.push(
        findingFor(
          ctx,
          rule,
          selector,
          evidence,
          violation.id === 'color-contrast'
            ? `contrast:${selector}`
            : `axe:${violation.id}:${selector}`,
        ),
      );
    }
  }

  // Kontrast ihlalleri büyük metin eşiğine göre ayrılır.
  const largeContrast = contrastViolations.filter((violation) =>
    violation.nodes.some((node) => {
      const expected = node.any?.[0]?.data?.['expectedContrastRatio'];
      return (
        expected !== undefined && Number.parseFloat(String(expected)) === 3
      );
    }),
  );
  if (contrastViolations.length) {
    const largeCount = largeContrast.length;
    const normalCount = contrastViolations.length - largeCount;
    checks.push(
      check(
        ctx,
        'A02',
        normalCount ? 'failed' : 'passed',
        normalCount
          ? 'Normal metin kontrastı yetersiz.'
          : 'Normal metin kontrastı yeterli.',
        {
          measurement: `${normalCount} kural ihlali, ${contrastViolations.reduce(
            (sum, violation) =>
              sum +
              violation.nodes.filter(
                (node) => node.any?.[0]?.data?.['expectedContrastRatio'] !== 3,
              ).length,
            0,
          )} düğüm etkilendi`,
        },
      ),
    );
    checks.push(
      check(
        ctx,
        'A03',
        largeCount ? 'failed' : 'passed',
        largeCount
          ? 'Büyük metin kontrastı yetersiz.'
          : 'Büyük metin kontrastı yeterli.',
        { measurement: `${largeCount} kural ihlali` },
      ),
    );
  } else {
    checks.push(
      check(ctx, 'A02', 'passed', 'Metin kontrastı yeterli.', {
        measurement: 'kontrast ihlali bulunmadı',
      }),
    );
    checks.push(
      check(ctx, 'A03', 'passed', 'Büyük metin kontrastı yeterli.', {
        measurement: 'kontrast ihlali bulunmadı',
      }),
    );
  }

  return { checks, findings };
}

function axeCategory(id: string): CheckRule {
  if (id === 'image-alt') return 'A06';
  if (id === 'target-size') return 'U12';
  // Form etiketi ve bağlantı/düğme adı kuralları Nabız'ın kendi kurallarıyla
  // (X01, U15) çakışır; bulgu tek yerde raporlanır.
  if (FORM_LABEL_RULES.includes(id)) return 'X01';
  if (NAME_RULES.includes(id)) return 'U15';
  if (
    [
      'aria-input-field-name',
      'form-field-multiple-labels',
      'label-title-only',
      'autocomplete-valid',
      'input-button-name',
    ].includes(id)
  )
    return 'A04';
  if (id.startsWith('aria-')) return 'A05';
  if (
    [
      'aria-toggle-field-name',
      'aria-meter-name',
      'aria-progressbar-name',
    ].includes(id)
  )
    return 'A07';
  if (
    [
      'bypass',
      'frame-focusable-content',
      'hidden-focus',
      'focus-order-semantics',
      'focus-visible',
      'keyboard',
    ].includes(id)
  )
    return 'A08';
  return 'A01';
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

export interface SeoRedirect {
  redirected: boolean;
  chain: string[];
}

const seoCheck = (
  ctx: EngineContext,
  rule: CheckRule,
  passed: boolean,
  message: string,
  measurement: string,
  evidence?: string,
  uncertain = false,
): CheckResult =>
  check(
    ctx,
    rule,
    uncertain ? 'inconclusive' : passed ? 'passed' : 'failed',
    message,
    {
      measurement,
      ...(evidence ? { evidence } : {}),
    },
  );

export function evaluateSeo(
  data: SeoPageData,
  redirect: SeoRedirect | null,
  ctx: EngineContext,
): EngineOutcome {
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  const push = (
    rule: CheckRule,
    passed: boolean,
    message: string,
    measurement: string,
    evidence?: string,
    uncertain = false,
  ) => {
    checks.push(
      seoCheck(ctx, rule, passed, message, measurement, evidence, uncertain),
    );
    if (!passed && !uncertain) {
      findings.push(
        findingFor(
          ctx,
          rule,
          '',
          evidence ? `${measurement} — ${evidence}` : measurement,
          `seo:${rule}`,
        ),
      );
    }
  };

  const titleLength = data.title.length;
  push(
    'S01',
    data.title.length > 0 && titleLength >= 30 && titleLength <= 60,
    data.title.length === 0
      ? 'Sayfa başlığı yok.'
      : `Sayfa başlığı ${titleLength} karakter.`,
    `Başlık uzunluğu ${titleLength} karakter (önerilen 30-60)`,
    data.title ? `title="${data.title}"` : undefined,
  );

  const descriptionLength = data.metaDescription.length;
  push(
    'S02',
    descriptionLength > 0 &&
      descriptionLength >= 50 &&
      descriptionLength <= 160,
    data.metaDescription.length === 0
      ? 'Meta açıklama yok.'
      : `Meta açıklama ${descriptionLength} karakter.`,
    `Meta açıklama uzunluğu ${descriptionLength} karakter (önerilen 50-160)`,
    data.metaDescription ? `description="${data.metaDescription}"` : undefined,
  );

  push(
    'S03',
    data.h1Count === 1,
    `Sayfada ${data.h1Count} adet H1 başlık var.`,
    `H1 sayısı ${data.h1Count}`,
    data.headings
      .filter((heading) => heading.level === 1)
      .map((heading) => heading.text)
      .join(' | ') || undefined,
  );

  const levels = data.headings.map((heading) => heading.level);
  const skipped = levels.filter(
    (level, index) => index > 0 && level - levels[index - 1]! > 1,
  );
  push(
    'S04',
    skipped.length === 0,
    skipped.length
      ? 'Başlık seviyesi atlanmış.'
      : 'Başlık hiyerarşisi kesintisiz.',
    `${levels.length} başlık, ${skipped.length} seviye atlama`,
    skipped.length ? `H${levels.join(', H')}` : undefined,
  );

  let canonicalValid = false;
  let canonicalNote = 'canonical etiketi yok';
  if (data.canonical) {
    try {
      const parsed = new URL(data.canonical, ctx.url);
      canonicalValid = parsed.protocol.startsWith('http');
      canonicalNote = `canonical="${data.canonical}"`;
    } catch {
      canonicalValid = false;
      canonicalNote = `canonical="${data.canonical}" (adres çözümlenemedi)`;
    }
  }
  push(
    'S05',
    canonicalValid,
    data.canonical ? 'Kanonical adres tanımlı.' : 'Kanonical adres yok.',
    canonicalValid
      ? 'canonical etiketi geçerli'
      : 'canonical etiketi eksik veya geçersiz',
    canonicalNote,
  );

  push(
    'S06',
    Boolean(data.robots),
    data.robots ? 'Robots meta etiketi tanımlı.' : 'Robots meta etiketi yok.',
    data.robots ? `robots="${data.robots}"` : 'robots etiketi bulunamadı',
    data.robots || undefined,
  );

  push(
    'S07',
    Boolean(data.htmlLang),
    data.htmlLang
      ? 'HTML lang özniteliği tanımlı.'
      : 'HTML lang özniteliği yok.',
    data.htmlLang ? `lang="${data.htmlLang}"` : 'lang özniteliği bulunamadı',
    data.htmlLang || undefined,
  );

  const viewportOk = /width\s*=\s*device-width/i.test(data.viewportMeta);
  push(
    'S08',
    viewportOk,
    viewportOk
      ? 'Viewport meta etiketi uygun.'
      : 'Viewport meta etiketi eksik veya uygun değil.',
    data.viewportMeta
      ? `viewport="${data.viewportMeta}"`
      : 'viewport etiketi bulunamadı',
    data.viewportMeta || undefined,
  );

  const ogCount = [
    data.openGraph.title,
    data.openGraph.description,
    data.openGraph.image,
    data.openGraph.url,
  ].filter(Boolean).length;
  push(
    'S09',
    ogCount >= 2,
    ogCount
      ? `${ogCount} Open Graph etiketi tanımlı.`
      : 'Open Graph etiketi yok.',
    `og:title/description/image/url içinden ${ogCount} tanesi tanımlı`,
    ogCount
      ? Object.entries(data.openGraph)
          .filter(([, value]) => value)
          .map(([key, value]) => `og:${key}=${value}`)
          .join(' | ')
      : undefined,
  );

  push(
    'S10',
    Boolean(data.twitter.card),
    data.twitter.card
      ? 'Twitter Card etiketi tanımlı.'
      : 'Twitter Card etiketi yok.',
    data.twitter.card
      ? `twitter:card="${data.twitter.card}"`
      : 'twitter:card bulunamadı',
    data.twitter.card || undefined,
  );

  push(
    'S11',
    data.images.missingAlt === 0,
    data.images.missingAlt
      ? `${data.images.missingAlt} görselde alt metin yok.`
      : 'Tüm görsellerde alt metin var.',
    `${data.images.total} görsel incelendi, ${data.images.missingAlt} tanesinde alt metin yok`,
    data.images.missingAltSelectors.join(' | ') || undefined,
  );

  const linksOk = data.links.emptyText === 0;
  if (!data.links.total) {
    checks.push(
      check(ctx, 'S12', 'inconclusive', 'İç bağlantı yapısı ölçülemedi.', {
        measurement: 'Sayfada bağlantı bulunamadı',
        reason: 'Bağlantı olmadığı için iç bağlantı yapısı değerlendirilemez.',
      }),
    );
  } else {
    push(
      'S12',
      linksOk,
      linksOk
        ? 'İç bağlantılar anlamlı.'
        : 'Bazı bağlantıların erişilebilir metni yok.',
      `${data.links.total} bağlantı, ${data.links.internal} iç bağlantı, ${data.links.emptyText} tanesinde boş metin`,
      data.links.emptyText
        ? `${data.links.emptyText} bağlantının metni yok`
        : undefined,
    );
  }

  if (redirect) {
    push(
      'S13',
      !redirect.redirected,
      redirect.redirected
        ? 'Adres kalıcı yönlendirme ile taşındı.'
        : 'Adres doğrudan sunuldu.',
      redirect.redirected
        ? `${redirect.chain.length} yönlendirme adımı`
        : 'yönlendirme yok',
      redirect.chain.join(' → ') || undefined,
    );
  } else {
    checks.push(
      check(ctx, 'S13', 'inconclusive', 'Yönlendirme durumu ölçülemedi.', {
        reason: 'Ana dokümanın yönlendirme zinciri kaydedilmedi.',
      }),
    );
  }

  const jsonLdOk = data.jsonLd.blocks > 0 && data.jsonLd.invalid === 0;
  push(
    'S14',
    jsonLdOk,
    data.jsonLd.blocks === 0
      ? 'Yapılandırılmış veri yok.'
      : data.jsonLd.invalid
        ? `${data.jsonLd.invalid} JSON-LD bloğu geçersiz.`
        : 'Yapılandırılmış veri geçerli.',
    `${data.jsonLd.blocks} JSON-LD bloğu, ${data.jsonLd.invalid} tanesi geçersiz`,
    data.jsonLd.types.length
      ? `Türler: ${data.jsonLd.types.join(', ')}`
      : data.jsonLd.errors.join(' | ') || undefined,
  );

  return { checks, findings };
}
