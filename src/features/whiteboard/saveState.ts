/** Saved chip states (CLAUDE.md §5): Saving / Saved / Offline / Error. */
export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error';

export interface SaveInputs {
  /** Pages with local changes not yet written. */
  dirty: number;
  /** Writes sent but not yet confirmed by the server. */
  inFlight: number;
  /** A write was rejected (after retries). */
  failed: boolean;
  online: boolean;
}

export function saveStatus({ dirty, inFlight, failed, online }: SaveInputs): SaveStatus {
  if (failed) return 'error';
  if (dirty === 0 && inFlight === 0) return 'saved';
  return online ? 'saving' : 'offline';
}

/** Retry delays for rejected writes: 1 s, 2 s, 4 s, 8 s, then give up and show Error. */
export function retryDelay(attempt: number): number | null {
  return attempt < 4 ? 1000 * 2 ** attempt : null;
}

/** Approximate stored size of a page; Firestore documents are limited to 1 MiB. */
export const PAGE_BYTES_LIMIT = 900_000;
export function estimateBytes(stored: unknown[]): number {
  return new TextEncoder().encode(JSON.stringify(stored)).length;
}
