import { z } from 'zod';

export const themeSchema = z.enum(['light', 'dark', 'paper']);
export const textSizeSchema = z.enum(['sm', 'md', 'lg']);

export type Theme = z.infer<typeof themeSchema>;
export type TextSize = z.infer<typeof textSizeSchema>;

export const appearanceSchema = z.object({
  theme: themeSchema.catch('light'),
  textSize: textSizeSchema.catch('md'),
});

export type Appearance = z.infer<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = { theme: 'light', textSize: 'md' };

/** Parses untrusted stored data; unknown or invalid values fall back to defaults. */
export function parseAppearance(input: unknown): Appearance {
  const result = appearanceSchema.safeParse(input);
  return result.success ? result.data : DEFAULT_APPEARANCE;
}

export function applyAppearance(root: HTMLElement, appearance: Appearance): void {
  root.dataset.theme = appearance.theme;
  root.dataset.textSize = appearance.textSize;
}
