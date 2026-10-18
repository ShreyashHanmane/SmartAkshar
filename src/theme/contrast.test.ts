import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio, parseThemeTokens } from './contrast';

const AA_TEXT = 4.5;
const AA_UI = 3;
const themes = parseThemeTokens(readFileSync(new URL('../index.css', import.meta.url), 'utf8'));

// [foreground, background, minimum ratio]
const PAIRS: [string, string, number][] = [
  ['ink', 'canvas', AA_TEXT],
  ['ink', 'surface', AA_TEXT],
  ['ink', 'surface-sunken', AA_TEXT],
  ['ink-muted', 'canvas', AA_TEXT],
  ['ink-muted', 'surface', AA_TEXT],
  ['on-primary', 'primary', AA_TEXT],
  ['on-danger', 'danger', AA_TEXT],
  ['accent', 'surface', AA_TEXT],
  ['accent', 'canvas', AA_TEXT],
  ['accent-on-soft', 'primary-soft', AA_TEXT],
  ['subject-physics', 'surface', AA_TEXT],
  ['subject-math', 'surface', AA_TEXT],
  ['subject-chemistry', 'surface', AA_TEXT],
  ['subject-history', 'surface', AA_TEXT],
  ['ink', 'highlight', AA_TEXT],
  ['focus', 'surface', AA_UI],
  ['focus', 'canvas', AA_UI],
  ['progress', 'track', AA_UI],
  ['progress', 'surface', AA_UI],
];

describe('theme tokens', () => {
  it('defines the three themes with the same token names', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'light', 'paper']);
    const names = Object.keys(themes.light ?? {}).sort();
    expect(Object.keys(themes.dark ?? {}).sort()).toEqual(names);
    expect(Object.keys(themes.paper ?? {}).sort()).toEqual(names);
  });

  for (const theme of ['light', 'dark', 'paper']) {
    describe(theme, () => {
      for (const [fg, bg, min] of PAIRS) {
        it(`${fg} on ${bg} meets ${min}:1`, () => {
          const tokens = themes[theme] ?? {};
          const ratio = contrastRatio(tokens[fg] ?? '', tokens[bg] ?? '');
          expect(ratio).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});

describe('contrastRatio', () => {
  it('matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
