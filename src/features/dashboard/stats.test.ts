import { describe, expect, it } from 'vitest';
import { dayKey } from '../../data/activity';
import { dayPart, focusHoursThisWeek, goalPercent, startOfWeek, studyStreak, weekKeys } from './stats';

// Sunday, 18 October 2026, 14:00 local time.
const today = new Date(2026, 9, 18, 14, 0);

describe('week helpers', () => {
  it('weeks start on Monday', () => {
    expect(dayKey(startOfWeek(today))).toBe('2026-10-12');
    expect(weekKeys(today)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(dayKey(startOfWeek(new Date(2026, 9, 12, 0, 1)))).toBe('2026-10-12');
  });

  it('sums only this week', () => {
    const hours = focusHoursThisWeek({ '2026-10-11': 36_000, '2026-10-12': 3600, '2026-10-18': 5400 }, today);
    expect(hours).toBeCloseTo(2.5);
  });
});

describe('studyStreak', () => {
  const day = 600;
  it('counts consecutive days ending today', () => {
    expect(studyStreak({ '2026-10-16': day, '2026-10-17': day, '2026-10-18': day }, today)).toBe(3);
  });
  it('keeps yesterday’s streak alive before studying today', () => {
    expect(studyStreak({ '2026-10-16': day, '2026-10-17': day }, today)).toBe(2);
  });
  it('breaks on a missed day and ignores tiny sessions', () => {
    expect(studyStreak({ '2026-10-15': day, '2026-10-17': day, '2026-10-18': day }, today)).toBe(2);
    expect(studyStreak({ '2026-10-18': 30 }, today)).toBe(0);
  });
  it('crosses month boundaries', () => {
    const nov1 = new Date(2026, 10, 1, 9);
    expect(studyStreak({ '2026-10-31': day, '2026-11-01': day }, nov1)).toBe(2);
  });
});

describe('goalPercent and dayPart', () => {
  it('caps at 100 and handles a zero goal', () => {
    expect(goalPercent(8.8, 10)).toBe(88);
    expect(goalPercent(12, 10)).toBe(100);
    expect(goalPercent(1, 0)).toBe(0);
  });
  it('names the part of the day', () => {
    expect(dayPart(new Date(2026, 0, 1, 8))).toBe('morning');
    expect(dayPart(today)).toBe('afternoon');
    expect(dayPart(new Date(2026, 0, 1, 20))).toBe('evening');
  });
});
