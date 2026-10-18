import { z } from 'zod';
import { type ImageKind, IMAGE_EXT } from '../shared/images';
import { getJson, request, send } from './api';
import { live } from './events';

/** Tiptap document JSON (cleaned by cleanContent in the browser and on the server). */
export type NoteContent = Record<string, unknown>;
const enc = encodeURIComponent;

export function subscribeNote(
  _uid: string,
  notebookId: string,
  next: (content: NoteContent | null, updatedAt: number) => void,
  fail: (e: unknown) => void,
) {
  return live(
    () =>
      getJson(
        `/api/notebooks/${enc(notebookId)}/note`,
        z.object({ content: z.record(z.string(), z.unknown()).nullable(), updatedAt: z.number().catch(0) }),
      ),
    [`note:${notebookId}`],
    (v) => next(v.content, v.updatedAt),
    fail,
  );
}

/** Saves the note; resolves with the server's save time. */
export async function saveNote(_uid: string, notebookId: string, content: NoteContent): Promise<number> {
  const res = (await send('PUT', `/api/notebooks/${enc(notebookId)}/note`, { content })) as { updatedAt?: number } | null;
  return res?.updatedAt ?? 0;
}

/** Uploads an image for a note; the server checks it again and returns its URL. */
export async function uploadNoteImage(_uid: string, notebookId: string, file: Blob, kind: ImageKind): Promise<string> {
  const res = await request('POST', `/api/notebooks/${enc(notebookId)}/images`, {
    body: file,
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': `image.${IMAGE_EXT[kind]}` },
  });
  return z.object({ url: z.string() }).parse(await res.json()).url;
}

/** Appends plain-text paragraphs to a notebook's typed notes (used by AI "Insert into notes"). */
export async function appendToNote(notebookId: string, text: string): Promise<void> {
  const current = await getJson(
    `/api/notebooks/${enc(notebookId)}/note`,
    z.object({ content: z.record(z.string(), z.unknown()).nullable() }),
  );
  const doc = (current.content ?? { type: 'doc', content: [] }) as { type: string; content?: unknown[] };
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.slice(0, 20_000) }] }));
  await send('PUT', `/api/notebooks/${enc(notebookId)}/note`, {
    content: { type: 'doc', content: [...(doc.content ?? []), ...paragraphs] },
  });
}
