import { describe, expect, it } from 'vitest';
import { type SearchItem, normalize, searchItems } from './match';

const items: SearchItem[] = [
  { kind: 'notebook', id: '1', title: 'Classical Mechanics', detail: 'Physics', href: '/notebooks/1' },
  { kind: 'notebook', id: '2', title: 'Calculus II', detail: 'Mathematics', href: '/notebooks/2' },
  { kind: 'book', id: '3', title: 'A Brief History of Time', detail: 'Stephen Hawking', href: '/library/3' },
  { kind: 'deck', id: '4', title: 'Mechanics essentials', detail: 'Physics', href: '/flashcards/4' },
  { kind: 'subject', id: '5', title: 'भौतिक विज्ञान', href: '/notebooks?subject=5' },
];

describe('searchItems', () => {
  it('ranks title prefix matches first', () => {
    expect(searchItems(items, 'mech').map((i) => i.id)).toEqual(['4', '1']);
  });
  it('matches every word across title and detail', () => {
    expect(searchItems(items, 'hawking time').map((i) => i.id)).toEqual(['3']);
    expect(searchItems(items, 'physics').map((i) => i.id)).toEqual(['1', '4']);
  });
  it('ignores case and diacritics', () => {
    expect(normalize('Écrit')).toBe('ecrit');
    expect(searchItems(items, 'CALCULUS').map((i) => i.id)).toEqual(['2']);
  });
  it('works for non-Latin scripts', () => {
    expect(searchItems(items, 'विज्ञान').map((i) => i.id)).toEqual(['5']);
  });
  it('returns nothing for blank queries and respects the limit', () => {
    expect(searchItems(items, '   ')).toEqual([]);
    expect(searchItems(items, 'c', 2)).toHaveLength(2);
  });
});
