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
  next: (content: NoteContent | null, pending: boolean) => void,
  fail: (e: unknown) => void,
) {
  return live(
    () => getJson(`/api/notebooks/${enc(notebookId)}/note`, z.object({ content: z.record(z.string(), z.unknown()).nullable() })),
    [`note:${notebookId}`],
    (v) => next(v.content, false),
    fail,
  );
}

export async function saveNote(_uid: string, notebookId: string, content: NoteContent): Promise<void> {
  await send('PUT', `/api/notebooks/${enc(notebookId)}/note`, { content });
}

/** Uploads an image for a note; the server checks it again and returns its URL. */
export async function uploadNoteImage(_uid: string, notebookId: string, file: Blob, kind: ImageKind): Promise<string> {
  const res = await request('POST', `/api/notebooks/${enc(notebookId)}/images`, {
    body: file,
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': `image.${IMAGE_EXT[kind]}` },
  });
  return z.object({ url: z.string() }).parse(await res.json()).url;
}
