import { describe, expect, it, vi } from 'vitest';
import { type Element, type StrokeElement } from './model';
import { drawElements, type View } from './render';
import { EditorStore, SAVE_DEBOUNCE_MS, type StoreDeps, type StorePage } from './editorStore';
import { fromStored, toStored } from '../../data/elements';

describe('Whiteboard stroke lifecycle regression tests', () => {
  function mockCanvas() {
    const operations: string[] = [];
    const ctx = {
      operations,
      save: () => operations.push('save'),
      restore: () => operations.push('restore'),
      setTransform: (...args: unknown[]) => operations.push(`setTransform(${args.join(',')})`),
      beginPath: () => operations.push('beginPath'),
      moveTo: (x: number, y: number) => operations.push(`moveTo(${x},${y})`),
      lineTo: (x: number, y: number) => operations.push(`lineTo(${x},${y})`),
      quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) =>
        operations.push(`quadraticCurveTo(${cpx},${cpy},${x},${y})`),
      stroke: () => operations.push('stroke'),
      fill: () => operations.push('fill'),
      arc: (x: number, y: number, r: number, sa: number, ea: number) =>
        operations.push(`arc(${x},${y},${r},${sa},${ea})`),
      clearRect: (...args: unknown[]) => operations.push(`clearRect(${args.join(',')})`),
      fillRect: (...args: unknown[]) => operations.push(`fillRect(${args.join(',')})`),
      rect: (...args: unknown[]) => operations.push(`rect(${args.join(',')})`),
      clip: () => operations.push('clip'),
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
      lineCap: '',
      lineJoin: '',
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D & { operations: string[] };

    const canvas = {
      width: 1000,
      height: 800,
      style: { transform: '', transformOrigin: '' },
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement & { width: number; height: number };

    return { canvas, ctx };
  }

  const penStroke: StrokeElement = {
    kind: 'stroke',
    id: 'stroke-pen-1',
    tool: 'pen',
    color: '#0f2a4a',
    width: 3,
    opacity: 1,
    points: [
      { x: 100, y: 100, p: 0.5 },
      { x: 120, y: 130, p: 0.6 },
      { x: 150, y: 170, p: 0.7 },
      { x: 200, y: 220, p: 0.5 },
    ],
  };

  const highlighterStroke: StrokeElement = {
    kind: 'stroke',
    id: 'stroke-hl-2',
    tool: 'highlighter',
    color: '#fef08a',
    width: 24,
    opacity: 0.4,
    points: [
      { x: 50, y: 80, p: 0.5 },
      { x: 150, y: 80, p: 0.5 },
      { x: 250, y: 80, p: 0.5 },
    ],
  };

  it('verifies strokes remain visible across the full lifecycle: drawing, state update, autosave, and reload', async () => {
    vi.useFakeTimers();
    let savedPages: StorePage[] = [];
    const serverStorage: Record<string, unknown[]> = {};
    let serverTime = 1000;

    const deps: StoreDeps = {
      save: async (p) => {
        savedPages.push(p);
        serverTime += 1000;
        serverStorage[p.id] = p.elements.map(toStored);
        return serverTime;
      },
      addPage: (index) => ({ id: `p${index}`, done: Promise.resolve() }),
      touch: vi.fn(),
      measure: (els) => els.length * 100,
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      now: () => Date.now(),
    };

    const store = new EditorStore(deps);
    store.applyRemote([{ id: 'p0', index: 0, elements: [], updatedAt: serverTime }]);

    // 1. Drawing a stroke: State update (commit)
    store.setElements('p0', [penStroke]);
    const committedPage = store.getSnapshot().pages[0];
    expect(committedPage?.elements).toHaveLength(1);
    expect(committedPage?.elements[0]?.id).toBe('stroke-pen-1');

    // 2. Canvas redraw: Verify stroke renders onto canvas context
    const view: View = { scale: 1, offsetX: 0, offsetY: 0 };
    const { ctx } = mockCanvas();
    drawElements(ctx, committedPage?.elements ?? [], view);
    const strokeOps = ctx.operations.filter((op) => op === 'stroke');
    expect(strokeOps.length).toBeGreaterThan(0);

    // 3. Autosave (after SAVE_DEBOUNCE_MS)
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(savedPages).toHaveLength(1);
    expect(store.getSnapshot().dirty + store.getSnapshot().inFlight).toBe(0);

    // 4. Remote sync arrives following save
    const remoteStored = serverStorage['p0'] ?? [];
    const remoteElements = remoteStored.map(fromStored).filter((x): x is Element => x !== null);
    store.applyRemote([{ id: 'p0', index: 0, elements: remoteElements, updatedAt: serverTime }]);
    expect(store.getSnapshot().pages[0]?.elements).toHaveLength(1);

    // 5. Page reload (fresh store loading from server)
    const freshStore = new EditorStore(deps);
    freshStore.applyRemote([{ id: 'p0', index: 0, elements: remoteElements, updatedAt: serverTime }]);
    const loadedPage = freshStore.getSnapshot().pages[0];
    expect(loadedPage?.elements).toHaveLength(1);
    expect(loadedPage?.elements[0]?.id).toBe('stroke-pen-1');

    // Verify strokes remain visible after reload
    const reloadCtx = mockCanvas().ctx;
    drawElements(reloadCtx, loadedPage?.elements ?? [], view);
    expect(reloadCtx.operations.filter((op) => op === 'stroke').length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it('verifies rapid successive strokes are preserved without dropping earlier strokes during state updates', async () => {
    vi.useFakeTimers();
    let savedPages: StorePage[] = [];
    const serverStorage: Record<string, unknown[]> = {};
    let serverTime = 2000;

    const deps: StoreDeps = {
      save: async (p) => {
        savedPages.push(p);
        serverTime += 1000;
        serverStorage[p.id] = p.elements.map(toStored);
        return serverTime;
      },
      addPage: (index) => ({ id: `p${index}`, done: Promise.resolve() }),
      touch: vi.fn(),
      measure: (els) => els.length * 100,
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      now: () => Date.now(),
    };

    const store = new EditorStore(deps);
    store.applyRemote([{ id: 'p0', index: 0, elements: [], updatedAt: serverTime }]);

    // Rapid successive stroke commits before autosave triggers
    store.setElements('p0', [penStroke]);
    store.setElements('p0', [penStroke, highlighterStroke]);

    expect(store.getSnapshot().pages[0]?.elements).toHaveLength(2);

    // Verify both strokes render to canvas
    const { ctx } = mockCanvas();
    const view: View = { scale: 1, offsetX: 0, offsetY: 0 };
    drawElements(ctx, store.getSnapshot().pages[0]?.elements ?? [], view);
    expect(ctx.operations.filter((op) => op === 'stroke').length).toBeGreaterThanOrEqual(2);

    // Advance timers for autosave
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(savedPages).toHaveLength(1);
    expect(savedPages[0]?.elements).toHaveLength(2);

    vi.useRealTimers();
  });

  it('verifies strokes survive page changes without cross-page contamination', () => {
    const deps: StoreDeps = {
      save: () => Promise.resolve(1000),
      addPage: (index) => ({ id: `p${index}`, done: Promise.resolve() }),
      touch: vi.fn(),
      measure: (els) => els.length * 100,
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      now: () => Date.now(),
    };

    const store = new EditorStore(deps);
    store.applyRemote([
      { id: 'p0', index: 0, elements: [penStroke], updatedAt: 1000 },
      { id: 'p1', index: 1, elements: [highlighterStroke], updatedAt: 1000 },
    ]);

    const snapshot = store.getSnapshot();
    const p0 = snapshot.pages.find((p) => p.id === 'p0');
    const p1 = snapshot.pages.find((p) => p.id === 'p1');

    expect(p0?.elements).toHaveLength(1);
    expect(p0?.elements[0]?.id).toBe('stroke-pen-1');
    expect(p1?.elements).toHaveLength(1);
    expect(p1?.elements[0]?.id).toBe('stroke-hl-2');

    const view: View = { scale: 1, offsetX: 0, offsetY: 0 };
    const ctx0 = mockCanvas().ctx;
    drawElements(ctx0, p0?.elements ?? [], view);
    expect(ctx0.operations.filter((op) => op === 'stroke').length).toBeGreaterThan(0);

    const ctx1 = mockCanvas().ctx;
    drawElements(ctx1, p1?.elements ?? [], view);
    expect(ctx1.operations.filter((op) => op === 'stroke').length).toBeGreaterThan(0);
  });
});

