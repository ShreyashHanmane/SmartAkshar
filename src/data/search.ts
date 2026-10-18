import { z } from 'zod';
import { getJson } from './api';

export type SearchKind = 'subject' | 'notebook' | 'book' | 'deck';

export interface SearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  /** Extra text that also matches (author, subject name). */
  detail?: string | undefined;
  href: string;
}

const indexSchema = z.object({
  subjects: z.array(z.object({ id: z.string(), name: z.string() })),
  notebooks: z.array(z.object({ id: z.string(), title: z.string(), subjectId: z.string().nullable() })),
  books: z.array(z.object({ id: z.string(), title: z.string(), author: z.string().nullable() })),
  decks: z.array(z.object({ id: z.string(), title: z.string() })),
});

/** A small title index of the user's own items for client-side search. */
export async function loadSearchIndex(_uid: string): Promise<SearchItem[]> {
  const index = await getJson('/api/search-index', indexSchema);
  const subjectNames = new Map(index.subjects.map((s) => [s.id, s.name]));
  const enc = encodeURIComponent;
  return [
    ...index.subjects.map((s) => ({ kind: 'subject' as const, id: s.id, title: s.name, href: `/notebooks?subject=${enc(s.id)}` })),
    ...index.notebooks.map((n) => ({
      kind: 'notebook' as const,
      id: n.id,
      title: n.title,
      detail: n.subjectId ? subjectNames.get(n.subjectId) : undefined,
      href: `/notebooks/${enc(n.id)}`,
    })),
    ...index.books.map((b) => ({ kind: 'book' as const, id: b.id, title: b.title, detail: b.author ?? undefined, href: `/library/${enc(b.id)}` })),
    ...index.decks.map((d) => ({ kind: 'deck' as const, id: d.id, title: d.title, href: `/flashcards/${enc(d.id)}` })),
  ];
}
