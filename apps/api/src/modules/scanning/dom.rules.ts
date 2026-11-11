import type { Page } from 'playwright';

export type DomRule = 'T04' | 'U04' | 'X01';

export interface DomCandidate {
  rule: DomRule;
  element: Element;
  evidence: string;
}

export interface DomAnalysis {
  findings: { rule: DomRule; selector: string; evidence: string }[];
  links: string[];
  truncated: boolean;
  /** Kural başına ölçüm: kaç öğe incelendi, kaçı sorunlu çıktı. */
  measurements: DomMeasurements;
}

export interface DomMeasurements {
  imagesChecked: number;
  imagesBroken: number;
  fieldsChecked: number;
  fieldsUnlabeled: number;
  buttonsChecked: number;
  buttonGroupsCompared: number;
  buttonDeviations: number;
  pageScrollWidth: number;
  viewportWidth: number;
}

// This function is serialized and evaluated inside the inspected page.
// It must not create named function bindings: transpilers such as esbuild
// (used by tsx) wrap them with a __name helper that does not exist in the page,
// which would abort the whole analysis. Only inline callbacks and IIFEs are used.
export const pageAnalysis = () => {
  const elements = [...document.querySelectorAll('*')].filter((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(element);
    return (
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]')
    );
  });

  const visibleImages = elements.filter((element) => element.tagName === 'IMG');
  const visibleFields = elements.filter((element) =>
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName),
  );

  const candidates: DomCandidate[] = [
    // Broken images: loaded but without intrinsic size.
    ...visibleImages
      .filter((element) => {
        const image = element as HTMLImageElement;
        return (
          image.complete &&
          image.naturalWidth === 0 &&
          Boolean(image.currentSrc || image.getAttribute('src'))
        );
      })
      .map((element) => ({
        rule: 'T04' as const,
        element,
        evidence:
          (element as HTMLImageElement).currentSrc ||
          element.getAttribute('src') ||
          '',
      })),
    // Form controls without an accessible name. Elements already evaluated by
    // axe-core are skipped so the same defect is not reported twice.
    ...visibleFields
      .filter((element) => {
        const field = element as HTMLInputElement;
        if (element.closest('[data-nabiz-covered="1"]')) return false;
        if (
          field.tagName === 'INPUT' &&
          ['hidden', 'submit', 'reset', 'button', 'image'].includes(field.type)
        )
          return false;
        const references = (field.getAttribute('aria-labelledby') || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const referenced =
          references.length > 0 &&
          references.every((id) =>
            Boolean(document.getElementById(id)?.textContent?.trim()),
          );
        const named =
          referenced ||
          Boolean(field.getAttribute('aria-label')?.trim()) ||
          [...(field.labels || [])].some((label) =>
            Boolean(label.textContent?.trim()),
          ) ||
          Boolean(field.title.trim());
        return !named;
      })
      .map((element) => ({
        rule: 'X01' as const,
        element,
        evidence: 'Alan için boş olmayan erişilebilir ad bulunamadı.',
      })),
  ];

  const groups = new Map<string, { element: Element; style: string }[]>();
  let buttonsChecked = 0;
  for (const button of elements) {
    if (!(
      button.tagName === 'BUTTON' || button.getAttribute('role') === 'button'
    ))
      continue;
    if (
      button.matches(':disabled, :hover, :focus, [aria-disabled="true"]') ||
      !button.classList.length
    )
      continue;
    buttonsChecked++;
    const style = getComputedStyle(button);
    const key = [
      button.tagName,
      [...button.classList].sort().join(' '),
      button.parentElement?.tagName,
      button.getAttribute('type') || 'button',
      button.getAttribute('aria-pressed') || '',
      button.getAttribute('data-variant') || '',
    ].join('|');
    const signature = JSON.stringify([
      style.color,
      style.backgroundColor,
      style.padding,
      style.fontSize,
      style.fontFamily,
      style.fontWeight,
      style.borderRadius,
      style.borderWidth,
      style.borderStyle,
      style.borderColor,
      style.minWidth,
      style.minHeight,
      style.boxSizing,
    ]);
    const group = groups.get(key) || [];
    group.push({ element: button, style: signature });
    groups.set(key, group);
  }
  let buttonGroupsCompared = 0;
  let buttonDeviations = 0;
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    buttonGroupsCompared++;
    const counts = new Map<string, number>();
    for (const item of group)
      counts.set(item.style, (counts.get(item.style) || 0) + 1);
    const majority = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    if (majority[1] <= group.length / 2) continue;
    for (const item of group)
      if (item.style !== majority[0]) {
        buttonDeviations++;
        candidates.push({
          rule: 'U04',
          element: item.element,
          evidence: `Grup çoğunluğu: ${majority[0]}; bu buton: ${item.style}. Kasıtlı varyant olabilir.`,
        });
      }
  }

  const findings = candidates.slice(0, 150).map((candidate) => ({
    rule: candidate.rule,
    selector: (() => {
      const parts: string[] = [];
      let current: Element | null = candidate.element;
      while (current && parts.length < 12) {
        const parent: Element | null = current.parentElement;
        parts.unshift(
          `${current.tagName.toLowerCase()}:nth-child(${parent ? [...parent.children].indexOf(current) + 1 : 1})`,
        );
        current = parent;
      }
      return parts.join(' > ');
    })(),
    evidence: candidate.evidence,
  }));

  const links = [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map((anchor) => anchor.href)
        .filter((href) => {
          try {
            const url = new URL(href);
            return (
              url.origin === location.origin &&
              ['http:', 'https:'].includes(url.protocol) &&
              !(
                url.pathname === location.pathname &&
                url.search === location.search &&
                url.hash
              )
            );
          } catch {
            return false;
          }
        })
        .map((href) => {
          const url = new URL(href);
          url.hash = '';
          return url.href;
        }),
    ),
  ];

  return {
    findings,
    links: links.slice(0, 30),
    truncated: links.length > 30 || candidates.length >= 150,
    measurements: {
      imagesChecked: visibleImages.length,
      imagesBroken: candidates.filter((candidate) => candidate.rule === 'T04')
        .length,
      fieldsChecked: visibleFields.length,
      fieldsUnlabeled: candidates.filter(
        (candidate) => candidate.rule === 'X01',
      ).length,
      buttonsChecked,
      buttonGroupsCompared,
      buttonDeviations,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    },
  };
};
export function analyzeDom(page: Page): Promise<DomAnalysis> {
  return page.evaluate(pageAnalysis);
}
