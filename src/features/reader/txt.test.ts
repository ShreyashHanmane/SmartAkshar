import { describe, expect, it } from 'vitest';
import { splitText } from './txt';

describe('splitText', () => {
  it('keeps paragraphs and splits into sections', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Para ${i} ${'x'.repeat(30)}`).join('\n\n');
    const sections = splitText(text, 100);
    expect(sections.flat()).toHaveLength(10);
    expect(sections.length).toBeGreaterThan(1);
    for (const s of sections) expect(s.join('').length).toBeLessThanOrEqual(140);
  });
  it('handles empty text and huge paragraphs', () => {
    expect(splitText('')).toEqual([[]]);
    expect(
      splitText('a'.repeat(250), 100)
        .flat()
        .map((p) => p.length),
    ).toEqual([100, 100, 50]);
  });
});
