import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebase } from './firebase';
import { LIMITS, type Subject, type SubjectColor, parseDoc, subjectSchema } from './models';

function subjectsCol(uid: string) {
  return collection(getFirebase().db, 'users', uid, 'subjects');
}

export function cleanSubjectName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, LIMITS.subjectName);
}

export function subscribeSubjects(uid: string, next: (s: Subject[]) => void, fail: (e: unknown) => void) {
  return onSnapshot(
    query(subjectsCol(uid), orderBy('createdAt', 'asc')),
    (snap) => next(snap.docs.flatMap((d) => parseDoc(subjectSchema, d.id, d.data()) ?? [])),
    fail,
  );
}

export async function createSubject(uid: string, name: string, color: SubjectColor): Promise<string> {
  const ref = await addDoc(subjectsCol(uid), {
    name: cleanSubjectName(name),
    color,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSubject(uid: string, id: string, patch: { name?: string; color?: SubjectColor }) {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) data.name = cleanSubjectName(patch.name);
  if (patch.color !== undefined) data.color = patch.color;
  await updateDoc(doc(subjectsCol(uid), id), data);
}

/**
 * Deletes a subject. Notebooks and decks that used it keep existing and become
 * "No subject" (their subjectId is cleared in the same batch where possible).
 */
export async function deleteSubject(uid: string, id: string): Promise<void> {
  const { db } = getFirebase();
  const affected = await Promise.all(
    ['notebooks', 'decks'].map((name) =>
      getDocs(query(collection(db, 'users', uid, name), where('subjectId', '==', id))),
    ),
  );
  const refs = affected.flatMap((snap) => snap.docs.map((d) => d.ref));
  // Firestore batches hold up to 500 writes; keep room for the subject delete.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 450))
      batch.update(ref, { subjectId: null, updatedAt: serverTimestamp() });
    await batch.commit();
  }
  await deleteDoc(doc(subjectsCol(uid), id));
}
