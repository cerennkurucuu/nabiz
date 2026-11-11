import type { Page } from 'playwright';

/**
 * UI/UX ve responsive ölçümleri.
 *
 * Sayfa içi betik tarayıcıya metin olarak taşınır. tsx/esbuild'in
 * `keepNames` dönüşümü adlandırılmış fonksiyon bağlarına `__name` yardımcısı
 * eklediği için burada yalnızca satır içi geri çağrılar ve IIFE kullanılır.
 */

export interface UxOverflowElement {
  selector: string;
  left: number;
  right: number;
  width: number;
}

export interface UxClippedElement {
  selector: string;
  axis: 'x' | 'y';
  hidden: number;
}

export interface UxTarget {
  selector: string;
  width: number;
  height: number;
}

export interface UxAdjacentTargets {
  first: string;
  second: string;
  gap: number;
}

export interface UxSmallText {
  selector: string;
  fontSize: number;
}

export interface UxUnnamedControl {
  selector: string;
  tag: string;
}

export interface UxFocusIndicator {
  selector: string;
}

export interface UxFocusOrder {
  selector: string;
  tabindex: number;
}

export interface UxHiddenFocusable {
  selector: string;
  reason: string;
}

export interface UxMeasurements {
  viewport: {
    scrollWidth: number;
    clientWidth: number;
    scrollHeight: number;
    clientHeight: number;
  };
  analyzedElements: number;
  truncated: boolean;
  overflowElements: UxOverflowElement[];
  clippedElements: UxClippedElement[];
  touchTargets: {
    checked: number;
    belowMinimum: UxTarget[];
    belowRecommended: UxTarget[];
  };
  adjacentTargets: UxAdjacentTargets[];
  smallText: UxSmallText[];
  unnamedControls: UxUnnamedControl[];
  focusIndicators: { checked: number; missing: UxFocusIndicator[] };
  focusOrder: UxFocusOrder[];
  hiddenFocusable: UxHiddenFocusable[];
}

/** Sayfa içi ölçüm. Sonuçlar ham veridir; kararlar Node tarafında verilir. */
export const pageUxAnalysis = (isMobile: boolean) => {
  // Sayfa içi betikte yalnızca fonksiyon gövdesi aktarılır; bu yüzden
  // sabitler burada tanımlanır.
  const MAX_ELEMENTS = 1500;
  const MAX_FOCUS_SAMPLES = 40;
  const clientWidth = document.documentElement.clientWidth;
  const clientHeight = document.documentElement.clientHeight;

  const all = [...document.querySelectorAll('*')];
  const truncated = all.length > MAX_ELEMENTS;
  const elements = all.slice(0, MAX_ELEMENTS).filter((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(element);
    return (
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]')
    );
  });

  const records = elements.map((element) => ({
    element,
    style: getComputedStyle(element),
    rect: element.getBoundingClientRect(),
    selector: (() => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 10) {
        const parent: Element | null = current.parentElement;
        parts.unshift(
          `${current.tagName.toLowerCase()}:nth-child(${parent ? [...parent.children].indexOf(current) + 1 : 1})`,
        );
        current = parent;
      }
      return parts.join(' > ');
    })(),
  }));

  const overflowElements = records
    .filter(
      (record) =>
        record.element !== document.body &&
        record.element !== document.documentElement &&
        record.element.parentElement !== document.documentElement,
    )
    .filter((record) => {
      if (!(record.rect.right > clientWidth + 2 || record.rect.left < -2))
        return false;
      // Kasıtlı olarak kaydırılan bölümler sayfa taşması üretmez.
      let parent = record.element.parentElement;
      while (parent && parent !== document.body) {
        const overflow = getComputedStyle(parent).overflowX;
        if (['hidden', 'clip', 'auto', 'scroll'].includes(overflow))
          return false;
        parent = parent.parentElement;
      }
      return true;
    })
    .slice(0, 40)
    .map((record) => ({
      selector: record.selector,
      left: Math.round(record.rect.left),
      right: Math.round(record.rect.right),
      width: Math.round(record.rect.width),
    }));

  const clippedElements = records
    .filter((record) => {
      const style = record.style;
      const clipsX = ['hidden', 'clip'].includes(style.overflowX);
      const clipsY = ['hidden', 'clip'].includes(style.overflowY);
      if (!clipsX && !clipsY) return false;
      const hasText = (record.element.textContent ?? '').trim().length > 0;
      if (!hasText) return false;
      if (clipsX && record.element.scrollWidth > record.element.clientWidth + 2)
        return true;
      return (
        clipsY && record.element.scrollHeight > record.element.clientHeight + 2
      );
    })
    .slice(0, 40)
    .map((record) => {
      const clipsX = ['hidden', 'clip'].includes(record.style.overflowX);
      return {
        selector: record.selector,
        axis: (clipsX ? 'x' : 'y') as 'x' | 'y',
        hidden: clipsX
          ? record.element.scrollWidth - record.element.clientWidth
          : record.element.scrollHeight - record.element.clientHeight,
      };
    });

  const interactive = records.filter((record) => {
    const element = record.element;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.matches(':disabled, [aria-disabled="true"]')) return false;
    const tag = element.tagName;
    if (tag === 'BUTTON') return true;
    if (tag === 'A' && element.hasAttribute('href')) return true;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) {
      const type = (element as HTMLInputElement).type;
      return type !== 'hidden';
    }
    const role = element.getAttribute('role');
    return role === 'button' || role === 'link' || role === 'menuitem';
  });

  // WCAG 2.5.8 metin içi bağlantılar için istisna tanımlar; satır içi
  // bağlantılar dokunma hedefi kontrolüne dahil edilmez.
  const blockLevelInteractive = interactive.filter(
    (record) =>
      record.style.display !== 'inline' &&
      // axe-core küçük hedef olarak işaretlediyse yeniden ölçülmez.
      !record.element.closest('[data-nabiz-covered="1"]'),
  );
  const touchTargets = {
    checked: blockLevelInteractive.length,
    belowMinimum: blockLevelInteractive
      .filter((record) => record.rect.width < 24 || record.rect.height < 24)
      .slice(0, 40)
      .map((record) => ({
        selector: record.selector,
        width: Math.round(record.rect.width),
        height: Math.round(record.rect.height),
      })),
    belowRecommended: isMobile
      ? blockLevelInteractive
          .filter((record) => record.rect.width < 44 || record.rect.height < 44)
          .slice(0, 40)
          .map((record) => ({
            selector: record.selector,
            width: Math.round(record.rect.width),
            height: Math.round(record.rect.height),
          }))
      : [],
  };

  // Yalnızca aynı ebeveyni paylaşan, blok düzenli etkileşim öğeleri karşılaştırılır;
  // metin içi bağlantılar yan yana geldiği için yanlış pozitif üretmez.
  const adjacentTargets: UxAdjacentTargets[] = [];
  const grouped = new Map<Element, typeof interactive>();
  for (const record of interactive) {
    const parent = record.element.parentElement;
    if (!parent) continue;
    const key = parent;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.rect.top - b.rect.top);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const first = sorted[index]!;
      const second = sorted[index + 1]!;
      if (first.style.display === 'inline' || second.style.display === 'inline')
        continue;
      const gapX = Math.max(
        second.rect.left - first.rect.right,
        first.rect.left - second.rect.right,
      );
      const gapY = Math.max(
        second.rect.top - first.rect.bottom,
        first.rect.top - second.rect.bottom,
      );
      // Ayrım yalnızca bir eksende varsa o eksendeki mesafe kullanılır.
      const gap =
        gapX > 0 ? gapX : gapY > 0 ? gapY : gapX === 0 && gapY === 0 ? 0 : -1;
      if (gap >= 0 && gap <= 2) {
        adjacentTargets.push({
          first: first.selector,
          second: second.selector,
          gap: Math.round(gap),
        });
        if (adjacentTargets.length >= 30) break;
      }
    }
    if (adjacentTargets.length >= 30) break;
  }

  const smallText = records
    .filter((record) => {
      const own = [...record.element.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => (node.textContent ?? '').trim())
        .join(' ')
        .trim();
      if (!own) return false;
      return Number.parseFloat(record.style.fontSize) < 12;
    })
    .slice(0, 40)
    .map((record) => ({
      selector: record.selector,
      fontSize: Number.parseFloat(record.style.fontSize),
    }));

  const unnamedControls = interactive
    .filter((record) => {
      const element = record.element;
      // axe-core bu öğeyi değerlendirdiyse yeniden raporlanmaz.
      if (element.closest('[data-nabiz-covered="1"]')) return false;
      const label = (element.getAttribute('aria-label') ?? '').trim();
      if (label) return false;
      const labelledBy = (element.getAttribute('aria-labelledby') ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (
        labelledBy.length &&
        labelledBy.every((id) =>
          Boolean(document.getElementById(id)?.textContent?.trim()),
        )
      )
        return false;
      // Form alanları için <label for> ilişkisi de erişilebilir ad sayılır.
      const field = element as HTMLInputElement;
      if (
        field.labels &&
        [...field.labels].some((item) => Boolean(item.textContent?.trim()))
      )
        return false;
      const text = (element.textContent ?? '').trim();
      if (text) return false;
      const image = element.querySelector('img[alt]');
      if (image && (image.getAttribute('alt') ?? '').trim()) return false;
      if ((element.getAttribute('title') ?? '').trim()) return false;
      if ((element.getAttribute('value') ?? '').trim()) return false;
      return true;
    })
    .slice(0, 40)
    .map((record) => ({
      selector: record.selector,
      tag: record.element.tagName.toLowerCase(),
    }));

  const focusable = records
    .filter((record) => {
      const element = record.element;
      const tabindex = element.getAttribute('tabindex');
      if (tabindex !== null) return Number.parseInt(tabindex, 10) >= 0;
      return [
        'A',
        'BUTTON',
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'DETAILS',
        'SUMMARY',
      ].includes(element.tagName);
    })
    .filter(
      (record) =>
        record.element.tagName !== 'INPUT' ||
        (record.element as HTMLInputElement).type !== 'hidden',
    );

  const focusIndicators = { checked: 0, missing: [] as UxFocusIndicator[] };
  const active = document.activeElement;
  for (const record of focusable.slice(0, MAX_FOCUS_SAMPLES)) {
    const element = record.element as HTMLElement;
    const before = getComputedStyle(element);
    const beforeState = `${before.outlineStyle}|${before.outlineWidth}|${before.outlineColor}|${before.boxShadow}|${before.borderColor}|${before.backgroundColor}`;
    const outlineSuppressed =
      before.outlineStyle === 'none' || before.outlineWidth === '0px';
    focusIndicators.checked += 1;
    try {
      element.focus({ preventScroll: true });
    } catch {
      continue;
    }
    const after = getComputedStyle(element);
    const afterState = `${after.outlineStyle}|${after.outlineWidth}|${after.outlineColor}|${after.boxShadow}|${after.borderColor}|${after.backgroundColor}`;
    // Yalnızca yazar tarafından bastırılmış odak göstergesi hata sayılır;
    // tarayıcının varsayılan odak halkası bir sorun değildir.
    if (beforeState === afterState && outlineSuppressed) {
      focusIndicators.missing.push({ selector: record.selector });
    }
  }
  if (active instanceof HTMLElement) {
    try {
      active.focus({ preventScroll: true });
    } catch {
      // Odak geri alınamazsa ölçüm tamamlanmış sayılır.
    }
  }

  const focusOrder = focusable
    .filter((record) => {
      const tabindex = record.element.getAttribute('tabindex');
      return tabindex !== null && Number.parseInt(tabindex, 10) > 0;
    })
    .slice(0, 30)
    .map((record) => ({
      selector: record.selector,
      tabindex: Number.parseInt(
        record.element.getAttribute('tabindex') ?? '0',
        10,
      ),
    }));

  const hiddenFocusable = focusable
    .filter((record) => {
      const element = record.element;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden')
        return true;
      return Boolean(element.closest('[aria-hidden="true"]'));
    })
    .slice(0, 30)
    .map((record) => {
      const element = record.element;
      const style = getComputedStyle(element);
      const reason =
        style.display === 'none'
          ? 'display:none'
          : style.visibility === 'hidden'
            ? 'visibility:hidden'
            : 'aria-hidden içinde';
      return { selector: record.selector, reason };
    });

  return {
    viewport: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight,
    },
    analyzedElements: elements.length,
    truncated,
    overflowElements,
    clippedElements,
    touchTargets,
    adjacentTargets,
    smallText,
    unnamedControls,
    focusIndicators,
    focusOrder,
    hiddenFocusable,
  } satisfies UxMeasurements;
};

/** Yalnızca yatay taşma ölçümü; kırılma noktası taramasında kullanılır. */
export const pageOverflowMetrics = () => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  overflowing: [...document.querySelectorAll('*')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const width = document.documentElement.clientWidth;
      return rect.right > width + 2 || rect.left < -2;
    })
    .slice(0, 5)
    .map((element) => element.tagName.toLowerCase()),
});

export function analyzeUx(
  page: Page,
  mobile: boolean,
): Promise<UxMeasurements> {
  return page.evaluate(pageUxAnalysis, mobile);
}
