/**
 * App-wide view of unsaved work: every saver (notes, whiteboard pages) reports
 * how many changes it still has to send. Settings shows it as the sync status,
 * and sign-out warns before discarding it.
 */
export interface SyncSummary {
  /** Changes not yet confirmed by the server. */
  pending: number;
  /** Some saves failed and are waiting to be retried. */
  failed: boolean;
}

const sources = new Map<object, SyncSummary>();
const listeners = new Set<() => void>();
let summary: SyncSummary = { pending: 0, failed: false };

export function reportSaves(source: object, state: SyncSummary) {
  const before = sources.get(source);
  if (before && before.pending === state.pending && before.failed === state.failed) return;
  if (state.pending === 0 && !state.failed) sources.delete(source);
  else sources.set(source, state);
  let pending = 0;
  let failed = false;
  for (const s of sources.values()) {
    pending += s.pending;
    failed ||= s.failed;
  }
  summary = { pending, failed };
  for (const l of listeners) l();
}

export function subscribeSyncSummary(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const getSyncSummary = () => summary;
