import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';

/**
 * axe-core tabanlı erişilebilirlik denetimi.
 *
 * axe-core betiği sayfaya CSP'den bağımsız olarak enjekte edilir (init
 * script). Yalnızca WCAG etiketli kurallar çalıştırılır; otomatik testler
 * WCAG'nin tamamını doğrulamaz, bu yüzden sonuç "bütün kriterler geçti"
 * olarak sunulmaz.
 */

export interface AxeNode {
  target: string[];
  html: string;
  failureSummary?: string | undefined;
  any?: { data?: Record<string, unknown> }[] | undefined;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  description: string;
  tags: string[];
  nodes: AxeNode[];
}

export interface AxeRunResult {
  available: boolean;
  error?: string;
  violations: AxeViolation[];
  /** axe'ın "kontrol edilemedi" dediği düğüm sayısı. */
  incomplete: number;
  durationMs: number;
  /** Kontrast kuralında axe'ın değerlendirdiği tüm öğeler. */
  contrastCovered: string[];
  /** axe'ın değerlendirdiği form etiketi öğeleri. */
  labelCovered: string[];
  /** axe'ın değerlendirdiği bağlantı ve düğme adı öğeleri. */
  nameCovered: string[];
  /** axe'ın küçük hedef olarak işaretlediği öğeler. */
  targetSizeViolations: { target: string; evidence: string }[];
  /** axe'ın bulduğu etiketsiz form alanı sayısı. */
  labelViolations: number;
  /** axe'ın bulduğu adı olmayan bağlantı/düğme sayısı. */
  nameViolations: number;
}

/** WCAG 2.2 AA kapsamındaki otomatik denetlenebilir kurallar. */
export const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

let cachedSource: string | undefined;

/** axe-core betiğini bir kez okur; sonraki çağrılarda bellekten gelir. */
export function axeSource(): string {
  if (cachedSource === undefined) {
    const require = createRequire(import.meta.url);
    cachedSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  }
  return cachedSource;
}

/** Sayfa gezinmesinden önce çağrılır; betik her çerçevede tanımlanır. */
export async function injectAxe(page: Page): Promise<void> {
  await page.addInitScript({ content: axeSource() });
}

export async function runAxe(
  page: Page,
  timeoutMs = 20000,
): Promise<AxeRunResult> {
  const evaluation = page.evaluate(
    async (config: {
      tags: string[];
      labelRules: string[];
      nameRules: string[];
    }) => {
      const tags = config.tags;
      const labelRules = config.labelRules;
      const nameRules = config.nameRules;
      const axe = (
        window as unknown as {
          axe?: {
            run: (options: unknown) => Promise<{
              violations: unknown[];
              passes: unknown[];
              incomplete: unknown[];
            }>;
          };
        }
      ).axe;
      if (!axe)
        return {
          available: false,
          error: 'axe-core betiği sayfaya yüklenemedi.',
          violations: [],
          incomplete: 0,
          durationMs: 0,
          contrastCovered: [],
          labelCovered: [],
          nameCovered: [],
          targetSizeViolations: [],
          labelViolations: 0,
          nameViolations: 0,
        };
      const started = Date.now();
      try {
        const results = await axe.run({
          runOnly: { type: 'tag', values: tags },
          resultTypes: ['violations', 'passes', 'incomplete'],
        });
        const violations = results.violations.map((entry) => {
          const violation = entry as {
            id: string;
            impact?: string | null;
            help?: string;
            description?: string;
            tags?: string[];
            nodes?: {
              target?: string[];
              html?: string;
              failureSummary?: string;
              any?: { data?: Record<string, unknown> }[];
            }[];
          };
          return {
            id: violation.id,
            impact: violation.impact ?? null,
            help: violation.help ?? '',
            description: violation.description ?? '',
            tags: violation.tags ?? [],
            nodes: (violation.nodes ?? []).map((node) => ({
              target: node.target ?? [],
              html: node.html ?? '',
              failureSummary: node.failureSummary,
              any: node.any,
            })),
          };
        });
        // Hedef listeleri tek geçişte toplanır; sayfa içinde adlandırılmış
        // fonksiyon bağı kullanılmaz (tsx/esbuild `__name` sorunu).
        const collected = new Map<string, string[]>();
        const entries = [
          ...(results.violations as {
            id?: string;
            nodes?: { target?: string[] }[];
          }[]),
          ...(results.passes as {
            id?: string;
            nodes?: { target?: string[] }[];
          }[]),
        ];
        for (const entry of entries) {
          const id = entry.id ?? '';
          if (
            id !== 'color-contrast' &&
            !labelRules.includes(id) &&
            !nameRules.includes(id)
          )
            continue;
          const list = collected.get(id) ?? [];
          for (const node of entry.nodes ?? []) {
            for (const target of node.target ?? []) list.push(target);
          }
          collected.set(id, list);
        }
        const contrastCovered = collected.get('color-contrast') ?? [];
        const labelCovered: string[] = [];
        for (const id of labelRules) {
          for (const target of collected.get(id) ?? [])
            labelCovered.push(target);
        }
        const nameCovered: string[] = [];
        for (const id of nameRules) {
          for (const target of collected.get(id) ?? [])
            nameCovered.push(target);
        }
        // Hedef boyutu ihlalleri kendi dokunma hedefi ölçümümüzle çakışır;
        // öğeler işaretlenir ve kanıt olduğu gibi aktarılır.
        const targetSizeViolations: { target: string; evidence: string }[] = [];
        let labelViolations = 0;
        let nameViolations = 0;
        for (const violation of violations) {
          if (violation.id === 'target-size') {
            for (const node of violation.nodes) {
              for (const target of node.target) {
                targetSizeViolations.push({
                  target,
                  evidence: node.failureSummary ?? violation.help,
                });
              }
            }
            continue;
          }
          if (labelRules.includes(violation.id))
            labelViolations += violation.nodes.length;
          if (nameRules.includes(violation.id))
            nameViolations += violation.nodes.length;
        }
        return {
          available: true,
          violations,
          incomplete: results.incomplete.length,
          durationMs: Date.now() - started,
          contrastCovered,
          labelCovered,
          nameCovered,
          targetSizeViolations,
          labelViolations,
          nameViolations,
        };
      } catch (error) {
        return {
          available: false,
          error:
            error instanceof Error
              ? `axe-core çalıştırılamadı: ${error.message}`
              : 'axe-core çalıştırılamadı.',
          violations: [],
          incomplete: 0,
          durationMs: Date.now() - started,
          contrastCovered: [],
          labelCovered: [],
          nameCovered: [],
          targetSizeViolations: [],
          labelViolations: 0,
          nameViolations: 0,
        };
      }
    },
    {
      tags: WCAG_TAGS,
      labelRules: FORM_LABEL_RULES,
      nameRules: NAME_RULES,
    },
  );

  const timeout = new Promise<AxeRunResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          available: true,
          error: `axe-core ${Math.round(timeoutMs / 1000)} saniye içinde tamamlanmadı.`,
          violations: [],
          incomplete: 0,
          durationMs: timeoutMs,
          contrastCovered: [],
          labelCovered: [],
          nameCovered: [],
          targetSizeViolations: [],
          labelViolations: 0,
          nameViolations: 0,
        }),
      timeoutMs,
    ),
  );
  return Promise.race([evaluation, timeout]);
}

/** Form etiketi kuralları; bu öğelerde kendi etiket kontrolümüz yapılmaz. */
export const FORM_LABEL_RULES = [
  'label',
  'aria-input-field-name',
  'form-field-multiple-labels',
  'label-title-only',
];

/** Bağlantı ve düğme adı kuralları. */
export const NAME_RULES = ['button-name', 'link-name'];

/** Hedef boyutu kuralı; kendi dokunma hedefi ölçümümüzle çakışır. */
export const TARGET_RULES = ['target-size'];

/**
 * axe'ın değerlendirdiği öğeleri işaretler. Sayfa içi ölçümler bu işareti
 * görüp ilgili öğeyi atlar; böylece aynı sorun iki motor tarafından iki kez
 * raporlanmaz.
 */
export async function markCovered(
  page: Page,
  targets: string[],
): Promise<void> {
  if (!targets.length) return;
  await page.evaluate((list: string[]) => {
    for (const target of list) {
      try {
        for (const element of document.querySelectorAll(target)) {
          element.setAttribute('data-nabiz-covered', '1');
          for (const child of element.querySelectorAll('*')) {
            child.setAttribute('data-nabiz-covered', '1');
          }
        }
      } catch {
        // Geçersiz seçici yok sayılır.
      }
    }
  }, targets);
}

/** axe kural kimliğini Nabız kurallarına eşler. */
export function axeRuleToCheckRule(
  id: string,
): 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'A08' {
  if (id === 'color-contrast') return 'A02';
  if (id === 'image-alt') return 'A06';
  if (
    [
      'label',
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
      'button-name',
      'link-name',
      'aria-toggle-field-name',
      'aria-meter-name',
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
