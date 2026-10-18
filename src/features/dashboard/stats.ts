import { type ActivityByDay, dayKey } from '../../data/activity';

/** A day counts toward the streak after this much tracked study. */
export const STREAK_MIN_SECONDS = 5 * 60;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday of the week containing `date` (local time). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(d, -offset);
}

/** Day keys Monday..Sunday for the week containing `today`. */
export function weekKeys(today: Date): string[] {
  const monday = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));
}

export function focusHoursThisWeek(days: ActivityByDay, today: Date): number {
  const seconds = weekKeys(today).reduce((sum, key) => sum + (days[key] ?? 0), 0);
  return seconds / 3600;
}

/**
 * Consecutive study days ending today. If today has no study yet, the streak
 * still counts through yesterday (it isn't broken until the day is over).
 */
export function studyStreak(days: ActivityByDay, today: Date): number {
  const studied = (d: Date) => (days[dayKey(d)] ?? 0) >= STREAK_MIN_SECONDS;
  let cursor = studied(today) ? today : addDays(today, -1);
  let streak = 0;
  while (studied(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 0..100, rounded down so 100% means the goal is really met. */
export function goalPercent(hours: number, goalHours: number): number {
  if (goalHours <= 0) return 0;
  return Math.min(100, Math.floor((hours / goalHours) * 100));
}

/** First day key worth loading for streak and week stats (about a year back). */
export function activityWindowStart(today: Date): string {
  return dayKey(addDays(today, -366));
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(date: Date): DayPart {
  const h = date.getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
