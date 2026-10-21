import { describe, expect, it, vi } from 'vitest';
import { EditorStore, SAVE_DEBOUNCE_MS, type StoreDeps, type StorePage } from './editorStore';
import type { Element } from './model';

const el = (id: string): Element => ({
  kind: 'shape',
  id,
  shape: 'line',
  color: '#000000',
  width: 2,
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 1,
});

function setup(save: StoreDeps['save'] = () => Promise.resolve()) {
  vi.useFakeTimers();
  const saved: StorePage[] = [];
  const deps: StoreDeps = {
    save: (p) => {
      saved.push(p);
      return save(p);
    },
    addPage: (index) => ({ id: `new${index}`, done: Promise.resolve() }),
    touch: vi.fn(),
    measure: (els) => els.length * 100,
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (id) => clearTimeout(id),
    now: () => Date.now(),
  };
  const store = new EditorStore(deps);
  store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);
  return { store, saved, deps };
}

describe('EditorStore', () => {
  it('debounces saves and reports saving -> saved', async () => {
    const { store, saved } = setup();
    store.setElements('p0', [el('a')]);
    store.setElements('p0', [el('a'), el('b')]);
    expect(store.getSnapshot().dirty).toBeGreaterThan(0);
    expect(saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.elements.map((e) => e.id)).toEqual(['a', 'b']);
    const s = store.getSnapshot();
    expect(s.dirty + s.inFlight).toBe(0);
    vi.useRealTimers();
  });

  it('keeps local edits when a stale remote snapshot arrives', async () => {
    let resolve: () => void = () => undefined;
    const { store } = setup(() => new Promise<void>((r) => (resolve = r)));
    store.setElements('p0', [el('local')]);
    store.applyRemote([{ id: 'p0', index: 0, elements: [el('remote')] }]);
    expect(store.getSnapshot().pages[0]?.elements[0]?.id).toBe('local');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    // Still in flight: still ignore remote.
    store.applyRemote([{ id: 'p0', index: 0, elements: [el('remote')] }]);
    expect(store.getSnapshot().pages[0]?.elements[0]?.id).toBe('local');
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    // Saved: remote updates apply again.
    store.applyRemote([{ id: 'p0', index: 0, elements: [el('remote')] }]);
    expect(store.getSnapshot().pages[0]?.elements[0]?.id).toBe('remote');
    vi.useRealTimers();
  });

  it('ignores a remote copy fetched before our latest confirmed save', async () => {
    const { store, deps } = setup();
    deps.save = () => Promise.resolve(2000);
    store.setElements('p0', [el('new')]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    store.applyRemote([{ id: 'p0', index: 0, elements: [el('old')], updatedAt: 1000 }]);
    expect(store.getSnapshot().pages[0]?.elements[0]?.id).toBe('new');
    store.applyRemote([{ id: 'p0', index: 0, elements: [el('other device')], updatedAt: 3000 }]);
    expect(store.getSnapshot().pages[0]?.elements[0]?.id).toBe('other device');
    vi.useRealTimers();
  });

  it('retries rejected writes with backoff, then shows an error, and recovers on retry', async () => {
    let fail = true;
    const { store, saved } = setup(() => (fail ? Promise.reject(new Error('denied')) : Promise.resolve()));
    store.setElements('p0', [el('a')]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    for (const ms of [1000, 2000, 4000, 8000]) await vi.advanceTimersByTimeAsync(ms);
    expect(saved).toHaveLength(5);
    expect(store.getSnapshot().failed).toBe(true);
    // Local data is never discarded.
    expect(store.getSnapshot().pages[0]?.elements[0]?.id).toBe('a');
    fail = false;
    store.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().failed).toBe(false);
    vi.useRealTimers();
  });

  it('keeps retrying while the server is unreachable, without ever failing', async () => {
    let reachable = false;
    const { store, saved, deps } = setup(() =>
      reachable ? Promise.resolve() : Promise.reject(new Error('network')),
    );
    deps.isTransient = () => true;
    store.setElements('p0', [el('a')]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(3000);
    expect(store.getSnapshot().failed).toBe(false);
    expect(store.getSnapshot().dirty).toBeGreaterThan(0);
    reachable = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getSnapshot().dirty + store.getSnapshot().inFlight).toBe(0);
    expect(saved.at(-1)?.elements.map((e) => e.id)).toEqual(['a']);
    vi.useRealTimers();
  });

  it('undo and redo restore page states and save them', async () => {
    const { store, saved } = setup();
    store.setElements('p0', [el('a')]);
    store.setElements('p0', [el('a'), el('b')]);
    store.undo();
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['a']);
    store.redo();
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['a', 'b']);
    store.undo();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(saved.at(-1)?.elements.map((e) => e.id)).toEqual(['a']);
    vi.useRealTimers();
  });

  it('refuses additions that would exceed the page size limit', () => {
    const { store, deps } = setup();
    deps.measure = () => 2_000_000;
    expect(store.setElements('p0', [el('a')])).toBe('too-large');
    expect(store.getSnapshot().pages[0]?.elements).toEqual([]);
    // Removing content is always allowed.
    expect(store.setElements('p0', [])).toBe('ok');
    vi.useRealTimers();
  });

  it('adds pages and keeps unsent local pages across remote snapshots', () => {
    const { store } = setup();
    const id = store.newPage();
    store.setElements(id, [el('x')]);
    store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);
    expect(store.getSnapshot().pages.map((p) => p.id)).toEqual(['p0', id]);
    vi.useRealTimers();
  });

  it('regression: does not overwrite saved strokes when a remote snapshot arrives with the same or older updatedAt', async () => {
    const { store, deps } = setup();
    deps.save = () => Promise.resolve(2000);
    store.setElements('p0', [el('stroke1')]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['stroke1']);

    // Snapshot from the refetch of the same save (updatedAt: 2000) must not overwrite writing with empty/older elements.
    store.applyRemote([{ id: 'p0', index: 0, elements: [], updatedAt: 2000 }]);
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['stroke1']);

    // Stale snapshot with older timestamp must also not overwrite.
    store.applyRemote([{ id: 'p0', index: 0, elements: [], updatedAt: 1999 }]);
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['stroke1']);

    // Snapshot missing updatedAt must not overwrite a confirmed save.
    store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['stroke1']);
    vi.useRealTimers();
  });

  it('regression: preserves local writing when remote updates arrive during retry backoff or after save failure', async () => {
    const { store } = setup(() => Promise.reject(new Error('save-failed')));
    store.setElements('p0', [el('stroke1')]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    // Write failed; waiting for backoff retry. Remote update arriving during backoff must not clear strokes.
    store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['stroke1']);

    // Advance through all retries until store is in failed state.
    for (const ms of [1000, 2000, 4000, 8000]) await vi.advanceTimersByTimeAsync(ms);
    expect(store.getSnapshot().failed).toBe(true);

    // Remote update arriving while in failed state must never discard unsaved writing.
    store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);
    expect(store.getSnapshot().pages[0]?.elements.map((e) => e.id)).toEqual(['stroke1']);
    vi.useRealTimers();
  });

  it('regression: keeps newly added pages when a remote update arrives while creation is in flight', () => {
    let resolveAdd: () => void = () => undefined;
    const deps: StoreDeps = {
      save: () => Promise.resolve(),
      addPage: (index) => ({ id: `new${index}`, done: new Promise<void>((r) => (resolveAdd = r)) }),
      touch: () => undefined,
      measure: () => 10,
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      now: () => Date.now(),
    };
    const store = new EditorStore(deps);
    store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);

    const id = store.newPage();
    // Server snapshot arrives before addPage resolves:
    store.applyRemote([{ id: 'p0', index: 0, elements: [] }]);
    expect(store.getSnapshot().pages.map((p) => p.id)).toContain(id);

    resolveAdd();
    vi.useRealTimers();
  });
});
