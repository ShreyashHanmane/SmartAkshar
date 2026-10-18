import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { z } from 'zod';
import { getFirebase } from './firebase';

/** Minimal book view for the dashboard; the full model comes with the reader (Module 6). */
export const bookSummarySchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(200).nullable().catch(null),
  format: z.enum(['pdf', 'epub', 'txt']),
  pageCount: z.number().int().min(0).max(100_000).catch(0),
  progress: z.number().min(0).max(1).catch(0),
  openedAt: z
    .custom<{ toMillis: () => number }>((v) => typeof v === 'object' && v !== null && 'toMillis' in v)
    .nullable()
    .catch(null),
});

export interface BookSummary extends Omit<z.infer<typeof bookSummarySchema>, 'openedAt'> {
  id: string;
  openedAt: number | null;
}

export function subscribeRecentBooks(
  uid: string,
  max: number,
  next: (b: BookSummary[]) => void,
  fail: (e: unknown) => void,
) {
  return onSnapshot(
    query(collection(getFirebase().db, 'users', uid, 'books'), orderBy('openedAt', 'desc'), limit(max)),
    (snap) =>
      next(
        snap.docs.flatMap((d) => {
          const parsed = bookSummarySchema.safeParse(d.data({ serverTimestamps: 'estimate' }));
          if (!parsed.success) return [];
          const { openedAt, ...rest } = parsed.data;
          return [{ ...rest, id: d.id, openedAt: openedAt ? openedAt.toMillis() : null }];
        }),
      ),
    fail,
  );
}
