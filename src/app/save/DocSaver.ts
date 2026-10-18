import { retryDelay } from '../../features/whiteboard/saveState';

export interface DocSaverDeps<T> {
  save: (value: T) => Promise<void>;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  /** True for "server unreachable" errors: keep the edit and retry later, never give up. */
  isTransient?: (error: unknown) => boolean;
}

export interface DocSaverState {
  /** Edits waiting for the debounce. */
  dirty: boolean;
  /** Writes sent but not confirmed by the server. */
  inFlight: number;
  /** The last write was rejected after retries. */
  failed: boolean;
}

/**
 * Debounced, queued autosave for a single document (e.g. a note). Rejected
 * writes are retried with backoff; the latest local value is never discarded.
 */
export class DocSaver<T> {
  private latest: T | undefined;
  private version = 0;
  private savedVersion = 0;
  private timer: number | null = null;
  private attempts = 0;
  private state: DocSaverState = { dirty: false, inFlight: 0, failed: false };
  private listeners = new Set<() => void>();

  constructor(
    private deps: DocSaverDeps<T>,
    private debounceMs = 800,
  ) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = () => this.state;

  private set(patch: Partial<DocSaverState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  update(value: T) {
    this.latest = value;
    this.version++;
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = this.deps.setTimer(() => this.flush(), this.debounceMs);
    this.set({ dirty: true, failed: false });
  }

  flush() {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.state.dirty || this.latest === undefined) return;
    const value = this.latest;
    const version = this.version;
    this.set({ dirty: false, inFlight: this.state.inFlight + 1 });
    this.deps
      .save(value)
      .then(() => {
        this.savedVersion = Math.max(this.savedVersion, version);
        this.attempts = 0;
        this.set({ inFlight: this.state.inFlight - 1, failed: false });
      })
      .catch((error: unknown) => {
        if (this.deps.isTransient?.(error)) {
          this.set({ inFlight: this.state.inFlight - 1 });
          this.deps.setTimer(() => {
            if (this.savedVersion < version && !this.state.dirty) {
              this.set({ dirty: true });
              this.flush();
            }
          }, 3000);
          if (this.savedVersion < version) this.set({ dirty: true });
          return;
        }
        const delay = retryDelay(this.attempts++);
        this.set({ inFlight: this.state.inFlight - 1, failed: delay === null });
        if (delay !== null)
          this.deps.setTimer(() => {
            // Skip if a newer value has already been saved (or is about to be).
            if (this.savedVersion < version && !this.state.dirty) {
              this.set({ dirty: true });
              this.flush();
            }
          }, delay);
      });
  }

  retry() {
    this.attempts = 0;
    this.set({ dirty: this.latest !== undefined, failed: false });
    this.flush();
  }

  hasUnsent() {
    return this.state.dirty;
  }
}
