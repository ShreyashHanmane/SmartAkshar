/** WCAG 2.x relative luminance / contrast helpers for #rrggbb colors. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Expected #rrggbb, got "${hex}"`);
  const n = parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Extracts `--name: #hex;` declarations per [data-theme] block from the token stylesheet. */
export function parseThemeTokens(css: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  const blockRe = /\[data-theme='(\w+)'\]\s*\{([^}]*)\}/g;
  for (const [, name, body] of css.matchAll(blockRe)) {
    if (!name || body === undefined) continue;
    const tokens: Record<string, string> = {};
    for (const [, key, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
      if (key && value) tokens[key] = value;
    }
    themes[name] = tokens;
  }
  return themes;
}
