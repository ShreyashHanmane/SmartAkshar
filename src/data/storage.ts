import { z } from 'zod';
import { getJson } from './api';
import { live } from './events';

const storageSchema = z.object({
  used: z.number(),
  limit: z.number(),
  books: z.object({ count: z.number(), bytes: z.number() }),
  images: z.object({ count: z.number(), bytes: z.number() }),
});
export type StorageUse = z.infer<typeof storageSchema>;

/** Space used by the user's uploaded files, refreshed when books, notes or the account change. */
export function subscribeStorage(next: (s: StorageUse) => void, fail: (e: unknown) => void) {
  return live(
    async () => {
      try {
        return await getJson('/api/account/storage', storageSchema);
      } catch {
        return {
          used: 0,
          limit: 200 * 1024 * 1024,
          books: { count: 0, bytes: 0 },
          images: { count: 0, bytes: 0 },
        };
      }
    },
    ['books', 'notebooks', 'account'],
    next,
    fail,
  );
}
