/** Counts active study seconds; the tracker hook feeds it ticks. Pure for testing. */
export const IDLE_AFTER_MS = 2 * 60 * 1000;

export class StudyClock {
  private lastInput: number;
  private lastTick: number;
  private pending = 0;

  constructor(now: number) {
    this.lastInput = now;
    this.lastTick = now;
  }

  input(now: number) {
    this.lastInput = now;
  }

  /** Adds elapsed time since the last tick if the page is visible and the user was recently active. */
  tick(now: number, visible: boolean) {
    const elapsed = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (visible && now - this.lastInput <= IDLE_AFTER_MS) this.pending += Math.min(elapsed, 5000);
  }

  /** Whole seconds ready to save; keeps the remainder. */
  take(max: number): number {
    const seconds = Math.min(max, Math.floor(this.pending / 1000));
    this.pending -= seconds * 1000;
    return seconds;
  }
}
