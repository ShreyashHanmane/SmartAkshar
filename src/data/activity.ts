import {
  collection,
  doc,
  documentId,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
} from 'firebase/firestore';
import { z } from 'zod';
import { getFirebase } from './firebase';

/** Seconds of tracked study per local calendar day (YYYY-MM-DD). */
export type ActivityByDay = Record<string, number>;

/** Largest single increment the rules accept (the tracker flushes every 60 s). */
export const MAX_FLUSH_SECONDS = 120;

const daySchema = z.object({ seconds: z.number().int().min(0).max(86_400) });

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function activityCol(uid: string) {
  return collection(getFirebase().db, 'users', uid, 'activity');
}

/** Subscribes to every tracked day from `fromKey` onward. */
export function subscribeActivity(
  uid: string,
  fromKey: string,
  next: (days: ActivityByDay) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    query(activityCol(uid), orderBy(documentId()), startAt(fromKey)),
    (snap) => {
      const days: ActivityByDay = {};
      for (const d of snap.docs) {
        const parsed = daySchema.safeParse(d.data());
        if (parsed.success && /^\d{4}-\d{2}-\d{2}$/.test(d.id)) days[d.id] = parsed.data.seconds;
      }
      next(days);
    },
    fail,
  );
}

/** Adds study seconds to a day (fire-and-forget; queued while offline). */
export function addStudySeconds(uid: string, key: string, seconds: number): Promise<void> {
  const amount = Math.max(1, Math.min(MAX_FLUSH_SECONDS, Math.round(seconds)));
  return setDoc(
    doc(activityCol(uid), key),
    { seconds: increment(amount), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
