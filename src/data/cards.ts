import { z } from 'zod';
import { getJson } from './api';
import { live } from './events';

function endOfToday(now = new Date()): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/** Live count of flashcards due by the end of today. */
export function subscribeDueCount(_uid: string, next: (count: number) => void, fail: (e: unknown) => void) {
  return live(
    async () => (await getJson(`/api/cards/due-count?before=${endOfToday()}`, z.object({ count: z.number() }))).count,
    ['cards'],
    next,
    fail,
  );
}
