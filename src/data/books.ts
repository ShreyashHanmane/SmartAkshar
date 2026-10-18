import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytesResumable } from 'firebase/storage';
import { z } from 'zod';
import { BOOK_MIME, type BookFormat } from '../features/library/fileTypes';
import { getFirebase } from './firebase';
import { randomName } from './uploads';

const millis = z
  .custom<{ toMillis: () => number }>((v) => typeof v === 'object' && v !== null && 'toMillis' in v)
  .nullable()
  .catch(null);

const positionSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).optional(),
    chapter: z.number().int().min(0).max(10_000).optional(),
    fraction: z.number().min(0).max(1).optional(),
  })
  .catch({});

export const bookSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(200).nullable().catch(null),
  format: z.enum(['pdf', 'epub', 'txt']),
  size: z.number().int().min(0).catch(0),
  storagePath: z.string().max(300),
  pageCount: z.number().int().min(0).max(100_000).catch(0),
  progress: z.number().min(0).max(1).catch(0),
  position: positionSchema,
  notebookId: z.string().max(64).nullable().catch(null),
  openedAt: millis,
});

export type Position = z.infer<typeof positionSchema>;
export interface Book extends Omit<z.infer<typeof bookSchema>, 'openedAt'> {
  id: string;
  openedAt: number | null;
}
/** Kept for the dashboard. */
export type BookSummary = Book;

function booksCol(uid: string) {
  return collection(getFirebase().db, 'users', uid, 'books');
}

function parseBook(id: string, data: unknown): Book | null {
  const parsed = bookSchema.safeParse(data);
  if (!parsed.success) return null;
  const { openedAt, ...rest } = parsed.data;
  return { ...rest, id, openedAt: openedAt ? openedAt.toMillis() : null };
}

export function subscribeBooks(
  uid: string,
  next: (b: Book[]) => void,
  fail: (e: unknown) => void,
  max = 500,
) {
  return onSnapshot(
    query(booksCol(uid), orderBy('openedAt', 'desc'), limit(max)),
    (snap) => next(snap.docs.flatMap((d) => parseBook(d.id, d.data({ serverTimestamps: 'estimate' })) ?? [])),
    fail,
  );
}

export function subscribeRecentBooks(
  uid: string,
  max: number,
  next: (b: Book[]) => void,
  fail: (e: unknown) => void,
) {
  return subscribeBooks(uid, next, fail, max);
}

export function subscribeBook(
  uid: string,
  id: string,
  next: (b: Book | null) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    doc(booksCol(uid), id),
    (snap) => next(snap.exists() ? parseBook(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
    fail,
  );
}

/**
 * Uploads a validated file to users/{uid}/books/{random}.{ext} with progress,
 * then creates the book document. Returns the new book id.
 */
export async function importBook(
  uid: string,
  file: Blob,
  meta: { format: BookFormat; title: string; author: string | null; pageCount: number },
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { storage } = getFirebase();
  const storagePath = `users/${uid}/books/${randomName(meta.format)}`;
  const task = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: BOOK_MIME[meta.format],
    cacheControl: 'private, max-age=31536000',
  });
  signal?.addEventListener('abort', () => task.cancel());
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (s) => onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      reject,
      resolve,
    );
  });
  const bookRef = doc(booksCol(uid));
  try {
    await setDoc(bookRef, {
      title: meta.title.slice(0, 200),
      author: meta.author ? meta.author.slice(0, 200) : null,
      format: meta.format,
      size: file.size,
      storagePath,
      pageCount: Math.max(0, Math.min(100_000, Math.round(meta.pageCount))),
      progress: 0,
      position: {},
      notebookId: null,
      createdAt: serverTimestamp(),
      openedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteObject(ref(storage, storagePath)).catch(() => undefined);
    throw error;
  }
  return bookRef.id;
}

/** Downloads the file bytes (from the user's own folder only). */
export function downloadBook(book: Book): Promise<ArrayBuffer> {
  return getBytes(ref(getFirebase().storage, book.storagePath));
}

export function markOpened(uid: string, id: string) {
  return updateDoc(doc(booksCol(uid), id), { openedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export function saveProgress(uid: string, id: string, progress: number, position: Position) {
  return updateDoc(doc(booksCol(uid), id), {
    progress: Math.max(0, Math.min(1, progress)),
    position,
    updatedAt: serverTimestamp(),
  });
}

export function updateBookMeta(
  uid: string,
  id: string,
  patch: { title?: string; notebookId?: string | null; pageCount?: number },
) {
  return updateDoc(doc(booksCol(uid), id), { ...patch, updatedAt: serverTimestamp() });
}

/** Deletes highlights, the file, and the book document. The linked notes notebook is kept. */
export async function deleteBook(uid: string, book: Book): Promise<void> {
  const { db, storage } = getFirebase();
  const highlights = await getDocs(collection(booksCol(uid), book.id, 'highlights'));
  for (let i = 0; i < highlights.docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const h of highlights.docs.slice(i, i + 450)) batch.delete(h.ref);
    await batch.commit();
  }
  await deleteObject(ref(storage, book.storagePath)).catch((e: { code?: string }) => {
    if (e.code !== 'storage/object-not-found') throw e;
  });
  await deleteDoc(doc(booksCol(uid), book.id));
}

// --- highlights ------------------------------------------------------------

const highlightSchema = z.object({
  section: z.number().int().min(0).max(100_000),
  exact: z.string().min(1).max(2000),
  prefix: z.string().max(64).catch(''),
  suffix: z.string().max(64).catch(''),
});
export interface Highlight extends z.infer<typeof highlightSchema> {
  id: string;
}

export function subscribeHighlights(
  uid: string,
  bookId: string,
  next: (h: Highlight[]) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    query(collection(booksCol(uid), bookId, 'highlights'), orderBy('createdAt', 'asc')),
    (snap) =>
      next(
        snap.docs.flatMap((d) => {
          const parsed = highlightSchema.safeParse(d.data());
          return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
        }),
      ),
    fail,
  );
}

/** `section` is the PDF page index or EPUB chapter index (0 for TXT). */
export function addHighlight(uid: string, bookId: string, h: Omit<Highlight, 'id'>): Promise<void> {
  return setDoc(doc(collection(booksCol(uid), bookId, 'highlights')), {
    section: h.section,
    exact: h.exact.slice(0, 2000),
    prefix: h.prefix.slice(0, 64),
    suffix: h.suffix.slice(0, 64),
    createdAt: serverTimestamp(),
  });
}

export function removeHighlight(uid: string, bookId: string, id: string): Promise<void> {
  return deleteDoc(doc(collection(booksCol(uid), bookId, 'highlights'), id));
}
