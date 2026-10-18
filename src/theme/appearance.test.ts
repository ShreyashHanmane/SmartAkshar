import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, parseAppearance } from './appearance';

describe('parseAppearance', () => {
  it('accepts valid values', () => {
    expect(parseAppearance({ theme: 'paper', textSize: 'lg' })).toEqual({ theme: 'paper', textSize: 'lg' });
  });

  it('replaces invalid fields with defaults', () => {
    expect(parseAppearance({ theme: 'neon', textSize: 'lg' })).toEqual({ theme: 'light', textSize: 'lg' });
  });

  it('returns defaults for non-objects', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('dark')).toEqual(DEFAULT_APPEARANCE);
  });
});
