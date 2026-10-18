import { z } from 'zod';
import type { Element } from '../features/whiteboard/model';
import { LIMITS, type Notebook, notebookSchema } from '../shared/schemas';
import { ApiError, getJson, newId, send } from './api';
import { parseElements } from './elements';
import { live } from './events';

export type { Notebook };
const enc = encodeURIComponent;

export function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, LIMITS.title);
}

/** Notebooks, most recently edited first. */
export function subscribeNotebooks(_uid: string, next: (n: Notebook[]) => void, fail: (e: unknown) => void) {
  return live(() => getJson('/api/notebooks', z.array(notebookSchema)), ['notebooks'], next, fail);
}

export function subscribeNotebook(_uid: string, id: string, next: (n: Notebook | null) => void, fail: (e: unknown) => void) {
  return live(
    () =>
      getJson(`/api/notebooks/${enc(id)}`, notebookSchema).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    [`notebook:${id}`, 'notebooks'],
    next,
    fail,
  );
}

/** Creates a notebook (with its first empty page). The id is known right away. */
export function createNotebook(_uid: string, input: { title: string; subjectId: string | null }): { id: string; done: Promise<void> } {
  const id = newId();
  const done = send('PUT', `/api/notebooks/${enc(id)}`, { title: cleanTitle(input.title), subjectId: input.subjectId }).then(() => undefined);
  return { id, done };
}

export async function renameNotebook(_uid: string, id: string, title: string): Promise<void> {
  await send('PATCH', `/api/notebooks/${enc(id)}`, { title: cleanTitle(title) });
}

export async function updateNotebook(
  _uid: string,
  id: string,
  patch: Partial<Pick<Notebook, 'paper' | 'background' | 'subjectId'>>,
): Promise<void> {
  await send('PATCH', `/api/notebooks/${enc(id)}`, patch);
}

/** Deletes the notebook with every page, its typed note, and its images. */
export async function deleteNotebook(_uid: string, id: string): Promise<void> {
  await send('DELETE', `/api/notebooks/${enc(id)}`);
}

/** Elements of the first page (for dashboard thumbnails). */
export function subscribeFirstPage(_uid: string, id: string, next: (els: Element[]) => void, fail: (e: unknown) => void) {
  return live(
    async () => {
      const pages = await getJson(`/api/notebooks/${enc(id)}/pages?first=1`, z.array(z.object({ elements: z.unknown() })));
      return parseElements(pages[0]?.elements);
    },
    [`pages:${id}`],
    next,
    fail,
  );
}
