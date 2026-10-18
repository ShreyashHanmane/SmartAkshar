import { reportSaves } from '../../app/save/pending';
import { type History, emptyHistory, record, redo as redoStep, undo as undoStep } from './history';
import type { Element } from './model';
import { PAGE_BYTES_LIMIT, retryDelay } from './saveState';

export interface StorePage {
  id: string;
  index: number;
  elements: Element[];
  /** Server time of the version this copy reflects (remote copies only). */
  updatedAt?: number;
}

export interface StoreDeps {
  /** Resolves with the server's save time when known. */
  save: (page: StorePage) => Promise<unknown>;
  addPage: (index: number) => { id: string; done: Promise<void> };
  touch: () => void;
  /** Size in bytes of a page's stored form (to stay under Firestore's limit). */
  measure: (elements: Element[]) => number;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  now: () => number;
  /** True for "server unreachable" errors: keep the edit and retry later, never give up. */
  isTransient?: (error: unknown) => boolean;
}

export const TRANSIENT_RETRY_MS = 3000;

export interface Snapshot {
  loadState: 'loading' | 'ready' | 'error';
  pages: StorePage[];
  dirty: number;
  inFlight: number;
  failed: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export const SAVE_DEBOUNCE_MS = 700;
const TOUCH_EVERY_MS = 30_000;

/**
 * Notebook editing state without React or Firebase (both injected), so the
 * autosave, retry, and conflict rules are unit-testable.
 * Conflict rule: last write wins per page; a page with unsaved local edits
 * ignores remote snapshots until its own write has landed.
 */
export class EditorStore {
  private pages = new Map<string, StorePage>();
  private loadState: Snapshot['loadState'] = 'loading';
  private dirty = new Set<string>();
  private inFlight = new Map<string, number>();
  /** Server time of our latest confirmed save per page. */
  private savedAt = new Map<string, number>();
  private attempts = new Map<string, number>();
  private failed = false;
  private timer: number | null = null;
  private history: History = emptyHistory;
  private lastTouch = 0;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;

  constructor(private deps: StoreDeps) {
    this.snapshot = this.build();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private build(): Snapshot {
    return {
      loadState: this.loadState,
      pages: [...this.pages.values()].sort((a, b) => a.index - b.index),
      dirty: this.dirty.size + (this.timer !== null ? 1 : 0),
      inFlight: this.inFlight.size,
      failed: this.failed,
      canUndo: this.history.undo.length > 0,
      canRedo: this.history.redo.length > 0,
    };
  }

  private emit() {
    this.snapshot = this.build();
    reportSaves(this, {
      pending: this.snapshot.dirty + this.snapshot.inFlight,
      failed: this.snapshot.failed,
    });
    for (const l of this.listeners) l();
  }

  // --- remote -------------------------------------------------------------
  applyRemote(remote: StorePage[]) {
    const next = new Map<string, StorePage>();
    for (const page of remote) {
      const local = this.pages.get(page.id);
      // A copy fetched before our latest confirmed save is stale: never let it win.
      const stale = page.updatedAt !== undefined && page.updatedAt < (this.savedAt.get(page.id) ?? 0);
      const busy = this.dirty.has(page.id) || this.inFlight.has(page.id) || stale;
      next.set(page.id, busy && local ? { ...local, index: page.index } : page);
    }
    // Keep local pages the server hasn't seen yet (e.g. added while offline).
    for (const [id, local] of this.pages)
      if (!next.has(id) && (this.dirty.has(id) || this.inFlight.has(id))) next.set(id, local);
    this.pages = next;
    this.loadState = 'ready';
    this.emit();
  }

  failLoad() {
    this.loadState = 'error';
    this.emit();
  }

  // --- editing ------------------------------------------------------------
  private put(pageId: string, elements: Element[], recordHistory: boolean): 'ok' | 'too-large' {
    const page = this.pages.get(pageId);
    if (!page) return 'ok';
    if (elements.length > page.elements.length && this.deps.measure(elements) > PAGE_BYTES_LIMIT)
      return 'too-large';
    if (recordHistory)
      this.history = record(this.history, { pageId, before: page.elements, after: elements });
    this.pages = new Map(this.pages).set(pageId, { ...page, elements });
    this.dirty.add(pageId);
    this.failed = false;
    this.schedule();
    this.emit();
    return 'ok';
  }

  setElements(pageId: string, elements: Element[]) {
    return this.put(pageId, elements, true);
  }

  undo() {
    const step = undoStep(this.history);
    if (!step) return;
    this.history = step.history;
    this.put(step.pageId, step.elements, false);
  }

  redo() {
    const step = redoStep(this.history);
    if (!step) return;
    this.history = step.history;
    this.put(step.pageId, step.elements, false);
  }

  newPage(): string {
    const index = this.pages.size;
    const { id, done } = this.deps.addPage(index);
    this.pages = new Map(this.pages).set(id, { id, index, elements: [] });
    done.catch(() => {
      this.failed = true;
      this.emit();
    });
    this.emit();
    return id;
  }

  clearHistory() {
    this.history = emptyHistory;
    this.emit();
  }

  // --- saving -------------------------------------------------------------
  private schedule() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = this.deps.setTimer(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush() {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    for (const pageId of [...this.dirty]) {
      const page = this.pages.get(pageId);
      this.dirty.delete(pageId);
      if (page) this.send(page);
    }
    if (this.deps.now() - this.lastTouch > TOUCH_EVERY_MS && this.inFlight.size > 0) {
      this.lastTouch = this.deps.now();
      this.deps.touch();
    }
    this.emit();
  }

  private send(page: StorePage) {
    const id = page.id;
    this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1);
    this.deps
      .save(page)
      .then((time) => {
        if (typeof time === 'number') this.savedAt.set(id, Math.max(time, this.savedAt.get(id) ?? 0));
        this.attempts.delete(id);
        if (this.attempts.size === 0) this.failed = false;
      })
      .catch((error: unknown) => {
        if (this.deps.isTransient?.(error)) {
          // Server unreachable: keep the edit and try again until it is back.
          this.dirty.add(id);
          this.deps.setTimer(() => this.flush(), TRANSIENT_RETRY_MS);
          return;
        }
        // Rejected by the server: retry with backoff, then show Error.
        const attempt = this.attempts.get(id) ?? 0;
        this.attempts.set(id, attempt + 1);
        const delay = retryDelay(attempt);
        if (delay === null) this.failed = true;
        else
          this.deps.setTimer(() => {
            this.dirty.add(id);
            this.flush();
          }, delay);
      })
      .finally(() => {
        const n = (this.inFlight.get(id) ?? 1) - 1;
        if (n <= 0) this.inFlight.delete(id);
        else this.inFlight.set(id, n);
        this.emit();
      });
  }

  /** Manual retry after the Error state: re-sends every page. */
  retry() {
    this.failed = false;
    this.attempts.clear();
    for (const id of this.pages.keys()) this.dirty.add(id);
    this.flush();
  }

  hasUnsent() {
    return this.dirty.size > 0 || this.timer !== null;
  }
}
