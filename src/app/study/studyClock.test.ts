import { describe, expect, it } from 'vitest';
import { IDLE_AFTER_MS, StudyClock } from './studyClock';

describe('StudyClock', () => {
  it('counts visible, active time', () => {
    const c = new StudyClock(0);
    for (let t = 1000; t <= 60_000; t += 1000) c.tick(t, true);
    expect(c.take(120)).toBe(60);
    expect(c.take(120)).toBe(0);
  });

  it('ignores hidden tabs and idle time', () => {
    const c = new StudyClock(0);
    for (let t = 1000; t <= 10_000; t += 1000) c.tick(t, false);
    expect(c.take(120)).toBe(0);
    for (let t = 11_000; t <= IDLE_AFTER_MS + 20_000; t += 1000) c.tick(t, true);
    // Visible from 10 s; idle cut-off at 120 s after the last input (t = 0).
    expect(c.take(1000)).toBe((IDLE_AFTER_MS - 10_000) / 1000);
    c.input(IDLE_AFTER_MS + 20_000);
    c.tick(IDLE_AFTER_MS + 21_000, true);
    expect(c.take(1000)).toBe(1);
  });

  it('does not count a long gap between ticks (sleep, throttled timers)', () => {
    const c = new StudyClock(0);
    c.tick(60_000, true);
    expect(c.take(120)).toBe(5);
  });

  it('respects the per-save maximum and keeps the rest', () => {
    const c = new StudyClock(0);
    for (let t = 1000; t <= 100_000; t += 1000) {
      c.tick(t, true);
      c.input(t);
    }
    expect(c.take(60)).toBe(60);
    expect(c.take(60)).toBe(40);
  });
});
