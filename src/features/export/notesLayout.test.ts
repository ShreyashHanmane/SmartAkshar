import { describe, expect, it } from 'vitest';
import { type Op, PAGE, layoutNotes, noteImages } from './notesLayout';
import { SAMPLE } from './docx.test';

// Every character is half the font size wide.
const measure = (text: string, style: { size: number }) => Array.from(text).length * style.size * 0.5;
const texts = (page: Op[]) => page.flatMap((op) => (op.kind === 'text' ? [op.text] : []));

describe('notes layout', () => {
  it('lays out every kind of block in order', () => {
    const pages = layoutNotes(SAMPLE, 'Physics', measure, () => ({ width: 1200, height: 600 }));
    expect(pages).toHaveLength(2); // the second full-width image moves to a new page
    const words = pages.flatMap(texts);
    expect(words.slice(0, 4)).toEqual(['Physics', 'Newton', '&', 'laws']);
    expect(words).toContain('•');
    expect(words).toContain('3.');
    expect(words).toContain('बल');
    expect(words).toContain('quoted');
    // Images are scaled to the content width.
    const images = pages.flat().filter((op) => op.kind === 'image');
    expect(images).toHaveLength(2);
    expect(pages[1]?.[0]).toMatchObject({ kind: 'image', y: PAGE.margin });
    expect(images[0]).toMatchObject({ w: PAGE.width - PAGE.margin * 2, h: 325 });
  });

  it('keeps all text inside the margins and wraps long lines', () => {
    const long = 'word '.repeat(2000) + 'x'.repeat(300);
    const pages = layoutNotes(
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] },
      'T',
      measure,
      () => null,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages)
      for (const op of page)
        if (op.kind === 'text') {
          expect(op.x).toBeGreaterThanOrEqual(PAGE.margin - 30);
          expect(op.x + measure(op.text, op.style)).toBeLessThanOrEqual(PAGE.width - PAGE.margin + 0.01);
          expect(op.y).toBeLessThanOrEqual(PAGE.height - PAGE.margin);
        }
    // Nothing lost or reordered (title first; spaces aren't drawn).
    expect(pages.flatMap(texts).join('') === `T${long.replace(/ /g, '')}`).toBe(true);
  });

  it('skips images it cannot size and lists the images a note uses', () => {
    const pages = layoutNotes(SAMPLE, 'T', measure, () => null);
    expect(pages[0]?.some((op) => op.kind === 'image')).toBe(false);
    expect(noteImages(SAMPLE)).toHaveLength(2);
  });
});
