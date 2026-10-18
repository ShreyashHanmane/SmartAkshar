/**
 * Leitner spaced repetition. Cards live in boxes 1-5; knowing a card moves it
 * up one box (longer gap before it is due again), not knowing it sends it back
 * to box 1 (due again the next day). New cards start in box 1, due now.
 */
export const BOXES = 5;
/** Days until a card in each box is due again (index = box). */
export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16] as const;
const DAY_MS = 86_400_000;

export type ReviewResult = 'know' | 'again';

export interface Schedule {
  box: number;
  due: number;
}

export function nextSchedule(box: number, result: ReviewResult, now: number): Schedule {
  const current = Math.max(1, Math.min(BOXES, Math.round(box)));
  const nextBox = result === 'know' ? Math.min(BOXES, current + 1) : 1;
  return { box: nextBox, due: now + (INTERVAL_DAYS[nextBox] ?? 1) * DAY_MS };
}

/** End of the local day containing `now` (cards due by then count as "due today"). */
export function endOfDay(now: Date): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function startOfDay(now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/**
 * Builds a quiz question: the right answer plus up to three distinct wrong
 * answers from other cards, in a shuffled order. `random` is injectable for tests.
 */
export function quizOptions(correct: string, pool: string[], random: () => number = Math.random): string[] {
  const norm = (s: string) => s.trim().toLocaleLowerCase();
  const wrong: string[] = [];
  for (const candidate of shuffle(pool, random)) {
    if (wrong.length === 3) break;
    if (norm(candidate) !== norm(correct) && !wrong.some((w) => norm(w) === norm(candidate)))
      wrong.push(candidate);
  }
  return shuffle([correct, ...wrong], random);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
