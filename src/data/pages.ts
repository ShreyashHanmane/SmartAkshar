import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { z } from 'zod';
import type { Element } from '../features/whiteboard/model';
import { parseElements, toStored } from './elements';
import { getFirebase } from './firebase';

export interface Page {
  id: string;
  index: number;
  elements: Element[];
  /** True while this page has a local write the server hasn't confirmed. */
  pending: boolean;
}

const pageSchema = z.object({ index: z.number().int().min(0).max(499), elements: z.unknown() });

function pagesCol(uid: string, notebookId: string) {
  return collection(getFirebase().db, 'users', uid, 'notebooks', notebookId, 'pages');
}

export function subscribePages(
  uid: string,
  notebookId: string,
  next: (pages: Page[]) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    query(pagesCol(uid, notebookId), orderBy('index', 'asc')),
    { includeMetadataChanges: true },
    (snap) =>
      next(
        snap.docs.flatMap((d) => {
          const parsed = pageSchema.safeParse(d.data());
          if (!parsed.success) return [];
          return [
            {
              id: d.id,
              index: parsed.data.index,
              elements: parseElements(parsed.data.elements),
              pending: d.metadata.hasPendingWrites,
            },
          ];
        }),
      ),
    fail,
  );
}

export function storedPage(index: number, elements: Element[]) {
  return { index, elements: elements.map(toStored), updatedAt: serverTimestamp() };
}

/** Writes a whole page (last write wins per page). Resolves when the server confirms. */
export function savePage(
  uid: string,
  notebookId: string,
  pageId: string,
  index: number,
  elements: Element[],
): Promise<void> {
  return setDoc(doc(pagesCol(uid, notebookId), pageId), storedPage(index, elements));
}

/** Appends an empty page and bumps the notebook's page count. Returns the new page id. */
export function addPage(uid: string, notebookId: string, index: number): { id: string; done: Promise<void> } {
  const { db } = getFirebase();
  const ref = doc(pagesCol(uid, notebookId));
  const batch = writeBatch(db);
  batch.set(ref, storedPage(index, []));
  batch.update(doc(db, 'users', uid, 'notebooks', notebookId), {
    pageCount: index + 1,
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, done: batch.commit() };
}

/**
 * Replaces all pages in one atomic batch (used when switching Paged <-> Infinite):
 * writes `pages` as p0..pN, deletes leftovers, and updates the notebook's mode and count.
 */
export function replaceAllPages(
  uid: string,
  notebookId: string,
  mode: 'paged' | 'infinite',
  pages: Element[][],
  existingIds: string[],
): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  const keep = new Set<string>();
  pages.forEach((elements, index) => {
    const id = index === 0 ? 'p0' : (existingIds[index] ?? doc(pagesCol(uid, notebookId)).id);
    keep.add(id);
    batch.set(doc(pagesCol(uid, notebookId), id), storedPage(index, elements));
  });
  for (const id of existingIds) if (!keep.has(id)) batch.delete(doc(pagesCol(uid, notebookId), id));
  batch.update(doc(db, 'users', uid, 'notebooks', notebookId), {
    mode,
    pageCount: Math.max(1, pages.length),
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

/** Marks the notebook as edited so it rises to the top of "Recent notebooks". */
export function touchNotebook(uid: string, notebookId: string): Promise<void> {
  return setDoc(
    doc(getFirebase().db, 'users', uid, 'notebooks', notebookId),
    { updatedAt: serverTimestamp() },
    { merge: true },
  );
}
