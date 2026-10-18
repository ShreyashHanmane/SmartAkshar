import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebase } from './firebase';
import { IMAGE_MIME, type ImageKind, randomName } from './uploads';

/** Tiptap document JSON. Validated and cleaned by the notes feature before use. */
export type NoteContent = Record<string, unknown>;

function noteRef(uid: string, notebookId: string) {
  return doc(getFirebase().db, 'users', uid, 'notebooks', notebookId, 'notes', 'main');
}

export function subscribeNote(
  uid: string,
  notebookId: string,
  next: (content: NoteContent | null, pending: boolean) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    noteRef(uid, notebookId),
    { includeMetadataChanges: true },
    (snap) => {
      const content: unknown = snap.data()?.content;
      next(
        content && typeof content === 'object' ? (content as NoteContent) : null,
        snap.metadata.hasPendingWrites,
      );
    },
    fail,
  );
}

export function saveNote(uid: string, notebookId: string, content: NoteContent): Promise<void> {
  return setDoc(noteRef(uid, notebookId), { content, updatedAt: serverTimestamp() });
}

/** Uploads a validated image under the user's folder; returns its download URL. */
export async function uploadNoteImage(
  uid: string,
  notebookId: string,
  file: Blob,
  kind: ImageKind,
): Promise<string> {
  const path = `users/${uid}/notes/${notebookId}/${randomName(kind === 'jpeg' ? 'jpg' : kind)}`;
  const objectRef = ref(getFirebase().storage, path);
  await uploadBytes(objectRef, file, {
    contentType: IMAGE_MIME[kind],
    cacheControl: 'private, max-age=31536000',
  });
  return getDownloadURL(objectRef);
}

/** Origins that may serve note images (the project's Storage, or the local emulator in development). */
export function allowedImageOrigins(): string[] {
  const { storage } = getFirebase();
  const bucket = storage.app.options.storageBucket ?? '';
  const emulator = import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true';
  return [
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`,
    ...(emulator
      ? [`http://127.0.0.1:9199/v0/b/${bucket}/o/`, `http://localhost:9199/v0/b/${bucket}/o/`]
      : []),
  ];
}
