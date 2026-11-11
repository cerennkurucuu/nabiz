/**
 * WCAG renk kontrastı hesabı.
 *
 * Oran hesabı burada tek yerde tutulur: sayfa içi ölçüm yalnızca ham renk
 * verilerini toplar, karar Node tarafında verilir. Böylece eşik değerleri ve
 * yuvarlama davranışı otomatik testlerle doğrulanabilir.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ContrastResult {
  /** 1-21 aralığında kontrast oranı. */
  ratio: number;
  /** Bu metin için gereken minimum oran. */
  required: number;
  passes: boolean;
  foreground: Rgb;
  background: Rgb;
  foregroundHex: string;
  backgroundHex: string;
  largeText: boolean;
}

const NAMED_COLORS: Record<string, string> = {
  transparent: 'rgba(0, 0, 0, 0)',
  black: 'rgb(0, 0, 0)',
  white: 'rgb(255, 255, 255)',
  red: 'rgb(255, 0, 0)',
  green: 'rgb(0, 128, 0)',
  blue: 'rgb(0, 0, 255)',
  gray: 'rgb(128, 128, 128)',
  grey: 'rgb(128, 128, 128)',
  yellow: 'rgb(255, 255, 0)',
  orange: 'rgb(255, 165, 0)',
  purple: 'rgb(128, 0, 128)',
  silver: 'rgb(192, 192, 192)',
  navy: 'rgb(0, 0, 128)',
  teal: 'rgb(0, 128, 128)',
  olive: 'rgb(128, 128, 0)',
  maroon: 'rgb(128, 0, 0)',
  lime: 'rgb(0, 255, 0)',
  aqua: 'rgb(0, 255, 255)',
  fuchsia: 'rgb(255, 0, 255)',
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** CSS renk değerini RGBA bileşenlerine çevirir; anlaşılmazsa null döner. */
export function parseCssColor(value: string): Rgba | null {
  const input = value.trim().toLowerCase();
  if (!input) return null;
  if (NAMED_COLORS[input]) return parseCssColor(NAMED_COLORS[input]!);
  const rgb = input.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?\s*\)$/,
  );
  if (rgb) {
    const alpha = rgb[4];
    return {
      r: clamp(Number(rgb[1]), 0, 255),
      g: clamp(Number(rgb[2]), 0, 255),
      b: clamp(Number(rgb[3]), 0, 255),
      a:
        alpha === undefined
          ? 1
          : alpha.endsWith('%')
            ? clamp(Number.parseFloat(alpha) / 100, 0, 1)
            : clamp(Number(alpha), 0, 1),
    };
  }
  const hex = input.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1]!;
    const expand = (value: string) =>
      value.length === 1 ? value + value : value;
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = [
        expand(digits[0]!),
        expand(digits[1]!),
        expand(digits[2]!),
        digits[3] === undefined ? 'ff' : expand(digits[3]!),
      ];
      return {
        r: Number.parseInt(r, 16),
        g: Number.parseInt(g, 16),
        b: Number.parseInt(b, 16),
        a: Number.parseInt(a, 16) / 255,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      const alpha = digits.length === 8 ? digits.slice(6, 8) : 'ff';
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: Number.parseInt(alpha, 16) / 255,
      };
    }
  }
  return null;
}

/**
 * Arka plan katmanlarını tek bir opak renge birleştirir.
 * Katmanlar üstten alta sıralıdır ve alfa değerleri hesaba katılır.
 */
export function compositeBackground(layers: Rgba[]): Rgb {
  let r = 255;
  let g = 255;
  let b = 255;
  for (const layer of [...layers].reverse()) {
    if (layer.a <= 0) continue;
    r = layer.r * layer.a + r * (1 - layer.a);
    g = layer.g * layer.a + g * (1 - layer.a);
    b = layer.b * layer.a + b * (1 - layer.a);
  }
  return { r, g, b };
}

const channel = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x bağılı parlaklık. */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channel(color.r) +
    0.7152 * channel(color.g) +
    0.0722 * channel(color.b)
  );
}

/** İki renk arasındaki WCAG kontrast oranı (1-21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG "büyük metin" tanımı: 18pt (24px) ve üzeri ya da 14pt (18.66px) ve
 * üzeri kalın metin.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  if (fontSizePx >= 24) return true;
  return fontSizePx >= 18.66 && fontWeight >= 700;
}

const toHex = (color: Rgb) =>
  `#${[color.r, color.g, color.b]
    .map((value) =>
      Math.round(clamp(value, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

export interface ContrastInput {
  /** Metnin kendi rengi. */
  foreground: string;
  /** Arka plan katmanları, üstten alta. */
  backgroundLayers: string[];
  fontSizePx: number;
  fontWeight: number;
}

export function evaluateContrast(input: ContrastInput): ContrastResult | null {
  const foreground = parseCssColor(input.foreground);
  if (!foreground) return null;
  const layers = input.backgroundLayers
    .map((value) => parseCssColor(value))
    .filter((value): value is Rgba => value !== null);
  if (!layers.length) return null;
  const opaqueForeground: Rgb = {
    r: foreground.r,
    g: foreground.g,
    b: foreground.b,
  };
  const background = compositeBackground(layers);
  const largeText = isLargeText(input.fontSizePx, input.fontWeight);
  const ratio = contrastRatio(opaqueForeground, background);
  const required = largeText ? 3 : 4.5;
  return {
    ratio: Math.round(ratio * 100) / 100,
    required,
    passes: ratio >= required,
    foreground: opaqueForeground,
    background,
    foregroundHex: toHex(opaqueForeground),
    backgroundHex: toHex(background),
    largeText,
  };
}
