/**
 * Page appearance is document content (it is exported and must look the same
 * on every device and theme), so these colours are part of the notebook model,
 * not UI tokens.
 */
export const PAPER_STYLES = ['dots', 'grid', 'lines', 'blank'] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number];

export const PAPER_BACKGROUNDS = {
  white: '#ffffff',
  cream: '#fbf6ea',
  sky: '#eef6fd',
  mint: '#eef8f1',
  slate: '#1f2a37',
} as const;
export type PaperBackground = keyof typeof PAPER_BACKGROUNDS;

/** Pattern ink per background (dark paper gets light rules). */
export function patternColor(bg: PaperBackground): string {
  return bg === 'slate' ? 'rgba(226, 236, 248, 0.22)' : 'rgba(15, 42, 74, 0.16)';
}

/** Default ink for a background, so text and pens stay readable on dark paper. */
export function defaultInk(bg: PaperBackground): string {
  return bg === 'slate' ? '#f4f7fb' : '#0f2a4a';
}

/** Pattern spacing in logical units. */
export const PATTERN_GAP = 32;
