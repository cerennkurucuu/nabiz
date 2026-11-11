import type { Page } from 'playwright';

/**
 * Metin kontrastı için ham veri toplayıcı.
 *
 * Ölçüm tamamen sayfa içinde yapılır; oran ve eşik kararı Node tarafında
 * (`contrast.ts`) verilir. axe-core'un işaretlediği öğeler atlanır; böylece
 * aynı sorun iki motor tarafından iki kez raporlanmaz.
 *
 * Adlandırılmış fonksiyon bağı kullanılmaz (tsx/esbuild `__name` sorunu).
 */

export interface ContrastSample {
  selector: string;
  color: string;
  backgroundLayers: string[];
  fontSize: number;
  fontWeight: number;
  hasBackgroundImage: boolean;
  text: string;
}

export const pageContrastSamples = () => {
  // Sayfa içi betikte yalnızca fonksiyon gövdesi aktarılır.
  const MAX_SAMPLES = 150;
  const elements = [...document.querySelectorAll('*')].filter((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]'))
      return false;
    // axe-core bu öğeyi zaten değerlendirdiyse yeniden ölçülmez.
    if (element.closest('[data-nabiz-covered="1"]')) return false;
    return (
      [...element.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => (node.textContent ?? '').trim())
        .join(' ')
        .trim().length > 0
    );
  });

  return elements.slice(0, MAX_SAMPLES).map((element) => {
    const style = getComputedStyle(element);
    const layers: string[] = [];
    let hasBackgroundImage = false;
    let node: Element | null = element;
    while (node) {
      const ancestor = getComputedStyle(node);
      if (ancestor.backgroundImage && ancestor.backgroundImage !== 'none') {
        hasBackgroundImage = true;
        break;
      }
      const color = ancestor.backgroundColor;
      if (color && color !== 'rgba(0, 0, 0, 0)') layers.push(color);
      node = node.parentElement;
    }
    return {
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
      color: style.color,
      backgroundLayers: layers.slice(0, 12),
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
      hasBackgroundImage,
      text: (element.textContent ?? '').trim().slice(0, 80),
    } satisfies ContrastSample;
  });
};

export function collectContrastSamples(page: Page): Promise<ContrastSample[]> {
  return page.evaluate(pageContrastSamples);
}
