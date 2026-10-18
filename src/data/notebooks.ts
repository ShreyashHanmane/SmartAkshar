import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { z } from 'zod';
import type { Element } from '../features/whiteboard/model';
import { PAPER_BACKGROUNDS, PAPER_STYLES } from '../features/whiteboard/paper';
import { parseElements } from './elements';
import { getFirebase } from './firebase';
import { LIMITS } from './models';

export const notebookSchema = z.object({
  title: z.string().min(1).max(LIMITS.title),
  subjectId: z.string().max(64).nullable().catch(null),
  mode: z.enum(['paged', 'infinite']).catch('paged'),
  paper: z.enum(PAPER_STYLES).catch('dots'),
  background: z
    .enum(
      Object.keys(PAPER_BACKGROUNDS) as [
        keyof typeof PAPER_BACKGROUNDS,
        ...(keyof typeof PAPER_BACKGROUNDS)[],
      ],
    )
    .catch('white'),
  pageCount: z.number().int().min(1).max(500).catch(1),
  updatedAt: z
    .custom<{ toMillis: () => number }>((v) => typeof v === 'object' && v !== null && 'toMillis' in v)
    .nullable()
    .catch(null),
});

export type NotebookData = z.infer<typeof notebookSchema>;
export interface Notebook extends Omit<NotebookData, 'updatedAt'> {
  id: string;
  /** Milliseconds; null while a local write is waiting for the server timestamp. */
  updatedAt: number | null;
}

export function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, LIMITS.title);
}

function notebooksCol(uid: string) {
  return collection(getFirebase().db, 'users', uid, 'notebooks');
}

function parseNotebook(id: string, data: unknown): Notebook | null {
  const parsed = notebookSchema.safeParse(data);
  if (!parsed.success) return null;
  const { updatedAt, ...rest } = parsed.data;
  return { ...rest, id, updatedAt: updatedAt ? updatedAt.toMillis() : null };
}

/** Notebooks, most recently edited first. */
export function subscribeNotebooks(
  uid: string,
  next: (notebooks: Notebook[]) => void,
  fail: (e: unknown) => void,
  max = 200,
) {
  return onSnapshot(
    query(notebooksCol(uid), orderBy('updatedAt', 'desc'), limitTo(max)),
    { includeMetadataChanges: false },
    (snap) =>
      next(snap.docs.flatMap((d) => parseNotebook(d.id, d.data({ serverTimestamps: 'estimate' })) ?? [])),
    fail,
  );
}

export function subscribeNotebook(
  uid: string,
  id: string,
  next: (n: Notebook | null) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    doc(notebooksCol(uid), id),
    (snap) =>
      next(snap.exists() ? parseNotebook(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
    fail,
  );
}

/**
 * Creates a notebook with its first (empty) page. Returns the id right away;
 * the write is applied locally and synced in the background (works offline).
 */
export function createNotebook(
  uid: string,
  input: { title: string; subjectId: string | null },
): { id: string; done: Promise<void> } {
  const { db } = getFirebase();
  const ref = doc(notebooksCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    title: cleanTitle(input.title),
    subjectId: input.subjectId,
    mode: 'paged',
    paper: 'dots',
    background: 'white',
    pageCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(ref, 'pages', 'p0'), { index: 0, elements: [], updatedAt: serverTimestamp() });
  return { id: ref.id, done: batch.commit() };
}

export function renameNotebook(uid: string, id: string, title: string): Promise<void> {
  return updateDoc(doc(notebooksCol(uid), id), { title: cleanTitle(title), updatedAt: serverTimestamp() });
}

export function updateNotebook(
  uid: string,
  id: string,
  patch: Partial<Pick<NotebookData, 'mode' | 'paper' | 'background' | 'subjectId' | 'pageCount'>>,
): Promise<void> {
  return updateDoc(doc(notebooksCol(uid), id), { ...patch, updatedAt: serverTimestamp() });
}

/** Deletes every page, then the notebook. */
export async function deleteNotebook(uid: string, id: string): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(notebooksCol(uid), id);
  const pages = await getDocs(collection(ref, 'pages'));
  for (let i = 0; i < pages.docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const page of pages.docs.slice(i, i + 450)) batch.delete(page.ref);
    await batch.commit();
  }
  await deleteDoc(ref);
}

/** Elements of the first page (for dashboard thumbnails). */
export function subscribeFirstPage(
  uid: string,
  id: string,
  next: (els: Element[]) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    query(collection(notebooksCol(uid), id, 'pages'), orderBy('index', 'asc'), limitTo(1)),
    (snap) => next(parseElements(snap.docs[0]?.data().elements)),
    fail,
  );
}
