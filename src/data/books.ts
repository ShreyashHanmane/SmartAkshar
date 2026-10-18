import { z } from 'zod';
import { BOOK_MIME, type BookFormat } from '../shared/fileTypes';
import { positionSchema } from '../shared/schemas';
import { ApiError, getJson, request, send } from './api';
import { live } from './events';

const enc = encodeURIComponent;

export const bookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  format: z.enum(['pdf', 'epub', 'txt']),
  size: z.number(),
  pageCount: z.number().int().min(0),
  progress: z.number().min(0).max(1).catch(0),
  position: positionSchema.catch({}),
  notebookId: z.string().nullable(),
  openedAt: z.number().nullable(),
});
export type Book = z.infer<typeof bookSchema>;
export type BookSummary = Book;
export type Position = z.infer<typeof positionSchema>;

export function subscribeBooks(_uid: string, next: (b: Book[]) => void, fail: (e: unknown) => void, max = 500) {
  return live(() => getJson(`/api/books?limit=${max}`, z.array(bookSchema)), ['books'], next, fail);
}

export function subscribeRecentBooks(uid: string, max: number, next: (b: Book[]) => void, fail: (e: unknown) => void) {
  return subscribeBooks(uid, next, fail, max);
}

export function subscribeBook(_uid: string, id: string, next: (b: Book | null) => void, fail: (e: unknown) => void) {
  return live(
    () =>
      getJson(`/api/books/${enc(id)}`, bookSchema).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    [`book:${id}`],
    next,
    fail,
  );
}

/** Uploads a book with progress (XMLHttpRequest reports upload progress; fetch doesn't). */
export function importBook(
  _uid: string,
  file: Blob,
  meta: { format: BookFormat; fileName: string; title: string; author: string | null; pageCount: number },
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/books');
    xhr.setRequestHeader('X-Akshar', '1');
    xhr.setRequestHeader('Content-Type', BOOK_MIME[meta.format]);
    xhr.setRequestHeader('X-File-Name', enc(meta.fileName));
    xhr.setRequestHeader('X-Title', enc(meta.title.slice(0, 200)));
    if (meta.author) xhr.setRequestHeader('X-Author', enc(meta.author.slice(0, 200)));
    xhr.setRequestHeader('X-Page-Count', String(Math.max(0, Math.round(meta.pageCount))));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status === 201) resolve((JSON.parse(xhr.responseText) as { id: string }).id);
      else {
        let code = 'server';
        try {
          code = (JSON.parse(xhr.responseText) as { error?: string }).error ?? code;
        } catch {
          // Non-JSON body.
        }
        reject(new ApiError(xhr.status, code));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

export async function downloadBook(book: Book): Promise<ArrayBuffer> {
  return (await request('GET', `/api/books/${enc(book.id)}/file`)).arrayBuffer();
}

export async function markOpened(_uid: string, id: string) {
  await send('PATCH', `/api/books/${enc(id)}`, { opened: true });
}

export async function saveProgress(_uid: string, id: string, progress: number, position: Position) {
  await send('PATCH', `/api/books/${enc(id)}`, { progress: Math.max(0, Math.min(1, progress)), position });
}

export async function updateBookMeta(_uid: string, id: string, patch: { title?: string; notebookId?: string | null; pageCount?: number }) {
  await send('PATCH', `/api/books/${enc(id)}`, patch);
}

/** Deletes highlights, the file, and the book. A linked notes notebook is kept. */
export async function deleteBook(_uid: string, book: Book): Promise<void> {
  await send('DELETE', `/api/books/${enc(book.id)}`);
}

// --- highlights --------------------------------------------------------------

const highlightSchema = z.object({ id: z.string(), section: z.number().int(), exact: z.string(), prefix: z.string(), suffix: z.string() });
export type Highlight = z.infer<typeof highlightSchema>;

export function subscribeHighlights(_uid: string, bookId: string, next: (h: Highlight[]) => void, fail: (e: unknown) => void) {
  return live(() => getJson(`/api/books/${enc(bookId)}/highlights`, z.array(highlightSchema)), [`highlights:${bookId}`], next, fail);
}

/** `section` is the PDF page index, EPUB chapter, or TXT part. */
export async function addHighlight(_uid: string, bookId: string, h: Omit<Highlight, 'id'>): Promise<void> {
  await send('POST', `/api/books/${enc(bookId)}/highlights`, {
    section: h.section,
    exact: h.exact.slice(0, 2000),
    prefix: h.prefix.slice(0, 64),
    suffix: h.suffix.slice(0, 64),
  });
}

export async function removeHighlight(_uid: string, bookId: string, id: string): Promise<void> {
  await send('DELETE', `/api/books/${enc(bookId)}/highlights/${enc(id)}`);
}
