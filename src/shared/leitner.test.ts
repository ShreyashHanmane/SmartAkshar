import { describe, expect, it } from 'vitest';
import { endOfDay, nextSchedule, quizOptions, shuffle } from './leitner';

const now = Date.UTC(2026, 9, 18, 12);
const day = 86_400_000;

describe('nextSchedule', () => {
  it('moves known cards up one box with growing gaps', () => {
    expect(nextSchedule(1, 'know', now)).toEqual({ box: 2, due: now + 2 * day });
    expect(nextSchedule(3, 'know', now)).toEqual({ box: 4, due: now + 8 * day });
    expect(nextSchedule(5, 'know', now)).toEqual({ box: 5, due: now + 16 * day });
  });
  it('sends forgotten cards back to box 1, due tomorrow', () => {
    expect(nextSchedule(4, 'again', now)).toEqual({ box: 1, due: now + day });
  });
  it('clamps odd stored boxes', () => {
    expect(nextSchedule(0, 'know', now).box).toBe(2);
    expect(nextSchedule(99, 'know', now).box).toBe(5);
  });
});

describe('quiz options', () => {
  const seq = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
  };
  it('includes the answer and up to three distinct distractors', () => {
    const options = quizOptions(
      'F = ma',
      ['F = ma', 'E = mc²', 'e = mc²', 'p = mv', 'W = Fd', 'P = W/t'],
      seq([0.1, 0.7, 0.3, 0.9]),
    );
    expect(options).toHaveLength(4);
    expect(options).toContain('F = ma');
    expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(4);
  });
  it('works with small decks', () => {
    expect(quizOptions('a', ['a', 'b']).sort()).toEqual(['a', 'b']);
  });
  it('shuffle keeps every item', () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('endOfDay', () => {
  it('is the last millisecond of the local day', () => {
    const e = new Date(endOfDay(new Date(2026, 9, 18, 9)));
    expect([e.getHours(), e.getMinutes(), e.getSeconds(), e.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });
});
