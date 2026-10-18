import { z } from 'zod';
import { MAX_FLUSH_SECONDS } from '../shared/schemas';
import { getJson, send } from './api';
import { live } from './events';

export { MAX_FLUSH_SECONDS };
/** Seconds of tracked study per local calendar day (YYYY-MM-DD). */
export type ActivityByDay = Record<string, number>;

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function subscribeActivity(_uid: string, fromKey: string, next: (days: ActivityByDay) => void, fail: (e: unknown) => void) {
  return live(
    () => getJson(`/api/activity?from=${encodeURIComponent(fromKey)}`, z.record(z.string(), z.number().int().min(0))),
    ['activity'],
    next,
    fail,
  );
}

export async function addStudySeconds(_uid: string, key: string, seconds: number): Promise<void> {
  const amount = Math.max(1, Math.min(MAX_FLUSH_SECONDS, Math.round(seconds)));
  await send('POST', '/api/activity', { day: key, seconds: amount });
}
