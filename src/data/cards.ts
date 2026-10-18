import { Timestamp, collection, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebase } from './firebase';

/**
 * Flashcards live in users/{uid}/cards (flat, with a deckId field) so "due
 * today" is a single query. The full card model is added with Module 7.
 */
function cardsCol(uid: string) {
  return collection(getFirebase().db, 'users', uid, 'cards');
}

function endOfToday(now = new Date()): Timestamp {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return Timestamp.fromDate(end);
}

/** Live count of cards due by the end of today. */
export function subscribeDueCount(uid: string, next: (count: number) => void, fail: (e: unknown) => void) {
  return onSnapshot(query(cardsCol(uid), where('due', '<=', endOfToday())), (snap) => next(snap.size), fail);
}

export async function countDueFromServer(uid: string): Promise<number> {
  const snap = await getCountFromServer(query(cardsCol(uid), where('due', '<=', endOfToday())));
  return snap.data().count;
}
