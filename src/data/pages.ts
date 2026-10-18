import { z } from 'zod';
import type { Element } from '../features/whiteboard/model';
import { getJson, newId, send } from './api';
import { parseElements, toStored } from './elements';
import { live } from './events';

export interface Page {
  id: string;
  index: number;
  elements: Element[];
}

const enc = encodeURIComponent;
const pagesSchema = z.array(z.object({ id: z.string(), index: z.number().int(), elements: z.unknown() }));

export function subscribePages(_uid: string, notebookId: string, next: (pages: Page[]) => void, fail: (e: unknown) => void) {
  return live(
    async () =>
      (await getJson(`/api/notebooks/${enc(notebookId)}/pages`, pagesSchema)).map((p) => ({
        id: p.id,
        index: p.index,
        elements: parseElements(p.elements),
      })),
    [`pages:${notebookId}`],
    next,
    fail,
  );
}

/** Writes a whole page (last write wins per page). */
export async function savePage(_uid: string, notebookId: string, pageId: string, index: number, elements: Element[]): Promise<void> {
  await send('PUT', `/api/notebooks/${enc(notebookId)}/pages/${enc(pageId)}`, { index, elements: elements.map(toStored) });
}

/** Appends an empty page. The id is known right away. */
export function addPage(_uid: string, notebookId: string, index: number): { id: string; done: Promise<void> } {
  const id = newId();
  return { id, done: savePage('', notebookId, id, index, []) };
}

/** Replaces all pages atomically (used when switching Paged <-> Infinite). */
export async function replaceAllPages(
  _uid: string,
  notebookId: string,
  mode: 'paged' | 'infinite',
  pages: Element[][],
  _existingIds: string[],
): Promise<void> {
  await send('POST', `/api/notebooks/${enc(notebookId)}/replace`, { mode, pages: pages.map((p) => p.map(toStored)) });
}

/** The server updates "last edited" on every page save; nothing extra to do. */
export function touchNotebook(_uid: string, _notebookId: string): Promise<void> {
  return Promise.resolve();
}
