import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

const now = Date.UTC(2026, 9, 18, 12);
describe('relativeTime', () => {
  it('formats recent edits', () => {
    expect(relativeTime(now - 2 * 3600_000, now)).toBe('2 hours ago');
    expect(relativeTime(now - 26 * 3600_000, now)).toBe('yesterday');
    expect(relativeTime(now - 5 * 24 * 3600_000, now)).toBe('5 days ago');
    expect(relativeTime(now - 10_000, now)).toBe('now');
  });
});
