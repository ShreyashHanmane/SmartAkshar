import { collection, getDocs, limit, query } from 'firebase/firestore';
import { z } from 'zod';
import { getFirebase } from './firebase';

export type SearchKind = 'subject' | 'notebook' | 'book' | 'deck';

export interface SearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  /** Extra text that also matches (author, subject name). */
  detail?: string | undefined;
  href: string;
}

const MAX_PER_KIND = 500;
const titled = z.object({
  title: z.string().max(200),
  subjectId: z.string().nullish(),
  author: z.string().max(200).nullish(),
});
const subject = z.object({ name: z.string().max(40) });

/**
 * Loads a small title index of the user's own items for client-side search.
 * Firestore has no full-text search, and each student's library is small.
 */
export async function loadSearchIndex(uid: string): Promise<SearchItem[]> {
  const { db } = getFirebase();
  const read = (name: string) => getDocs(query(collection(db, 'users', uid, name), limit(MAX_PER_KIND)));
  const [subjects, notebooks, books, decks] = await Promise.all(
    ['subjects', 'notebooks', 'books', 'decks'].map(read),
  );

  const subjectNames = new Map<string, string>();
  const items: SearchItem[] = [];
  for (const d of subjects?.docs ?? []) {
    const parsed = subject.safeParse(d.data());
    if (!parsed.success) continue;
    subjectNames.set(d.id, parsed.data.name);
    items.push({
      kind: 'subject',
      id: d.id,
      title: parsed.data.name,
      href: `/notebooks?subject=${encodeURIComponent(d.id)}`,
    });
  }
  const add = (snap: typeof subjects, kind: SearchItem['kind'], href: (id: string) => string) => {
    for (const d of snap?.docs ?? []) {
      const parsed = titled.safeParse(d.data());
      if (!parsed.success) continue;
      const detail =
        parsed.data.author ?? (parsed.data.subjectId ? subjectNames.get(parsed.data.subjectId) : undefined);
      items.push({ kind, id: d.id, title: parsed.data.title, detail, href: href(d.id) });
    }
  };
  add(notebooks, 'notebook', (id) => `/notebooks/${encodeURIComponent(id)}`);
  add(books, 'book', (id) => `/library/${encodeURIComponent(id)}`);
  add(decks, 'deck', (id) => `/flashcards/${encodeURIComponent(id)}`);
  return items;
}
