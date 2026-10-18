import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocSaver } from './DocSaver';

function setup(save: (v: string) => Promise<void>) {
  vi.useFakeTimers();
  const saved: string[] = [];
  const saver = new DocSaver<string>({
    save: (v) => {
      saved.push(v);
      return save(v);
    },
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (id) => clearTimeout(id),
  });
  return { saver, saved };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DocSaver', () => {
  it('debounces to the latest value', async () => {
    const { saver, saved } = setup(() => Promise.resolve());
    saver.update('a');
    saver.update('ab');
    await vi.advanceTimersByTimeAsync(800);
    expect(saved).toEqual(['ab']);
    expect(saver.getState()).toEqual({ dirty: false, inFlight: 0, failed: false });
  });

  it('retries with backoff, then fails, keeping the value for a manual retry', async () => {
    let ok = false;
    const { saver, saved } = setup(() => (ok ? Promise.resolve() : Promise.reject(new Error('x'))));
    saver.update('v');
    await vi.advanceTimersByTimeAsync(800);
    for (const ms of [1000, 2000, 4000, 8000]) await vi.advanceTimersByTimeAsync(ms);
    expect(saved).toHaveLength(5);
    expect(saver.getState().failed).toBe(true);
    ok = true;
    saver.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved.at(-1)).toBe('v');
    expect(saver.getState().failed).toBe(false);
  });

  it('a newer edit supersedes a pending retry', async () => {
    let calls = 0;
    const { saver, saved } = setup(() =>
      ++calls === 1 ? Promise.reject(new Error('x')) : Promise.resolve(),
    );
    saver.update('old');
    await vi.advanceTimersByTimeAsync(800);
    saver.update('new');
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(['old', 'new']);
  });
});
