import { describe, expect, it } from 'vitest';
import { enclosed, moveSelected, pointInPolygon, removeSelected, selectInLoop, textAt } from './geometry';
import { emptyHistory, record, redo, undo } from './history';
import { type Element, PAGE_HEIGHT, type StrokeElement, elementBounds } from './model';
import { PAGE_GAP, infiniteToPages, pagesToInfinite } from './modes';
import { estimateBytes, retryDelay, saveStatus } from './saveState';

const stroke = (id: string, pts: [number, number][]): StrokeElement => ({
  kind: 'stroke',
  id,
  tool: 'pen',
  color: '#000000',
  width: 2,
  opacity: 1,
  points: pts.map(([x, y]) => ({ x, y, p: 1 })),
});
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('geometry', () => {
  it('point in polygon', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('a loop encloses strokes that are at least half inside', () => {
    expect(
      enclosed(
        stroke('a', [
          [10, 10],
          [20, 20],
          [200, 200],
        ]),
        square,
      ),
    ).toBe(true);
    expect(
      enclosed(
        stroke('b', [
          [10, 10],
          [200, 200],
          [300, 300],
        ]),
        square,
      ),
    ).toBe(false);
    expect(enclosed(stroke('c', [[10, 10]]), [{ x: 0, y: 0 }])).toBe(false);
  });

  it('selects, moves, and removes', () => {
    const els: Element[] = [
      stroke('in', [
        [10, 10],
        [20, 20],
      ]),
      stroke('out', [
        [500, 500],
        [600, 600],
      ]),
    ];
    const ids = selectInLoop(els, square);
    expect([...ids]).toEqual(['in']);
    const moved = moveSelected(els, ids, 5, -5);
    expect((moved[0] as StrokeElement).points[0]).toEqual({ x: 15, y: 5, p: 1 });
    expect(moved[1]).toBe(els[1]);
    expect(removeSelected(els, ids).map((e) => e.id)).toEqual(['out']);
  });

  it('finds text under a point', () => {
    const text: Element = {
      kind: 'text',
      id: 't',
      color: '#000000',
      font: 'sans',
      size: 20,
      x: 0,
      y: 0,
      boxWidth: 100,
      text: 'hi',
    };
    expect(textAt([text], { x: 10, y: 10 })?.id).toBe('t');
    expect(textAt([text], { x: 300, y: 10 })).toBeUndefined();
  });
});

describe('history', () => {
  it('undoes and redoes page snapshots', () => {
    const a: Element[] = [];
    const b: Element[] = [stroke('1', [[0, 0]])];
    let h = record(emptyHistory, { pageId: 'p0', before: a, after: b });
    const u = undo(h);
    expect(u?.elements).toBe(a);
    h = u?.history ?? h;
    expect(redo(h)?.elements).toBe(b);
    expect(undo(emptyHistory)).toBeNull();
  });

  it('a new change clears redo', () => {
    let h = record(emptyHistory, { pageId: 'p0', before: [], after: [] as Element[] });
    h = undo(h)?.history ?? h;
    h = record(h, { pageId: 'p0', before: [], after: [stroke('x', [[1, 1]])] });
    expect(h.redo).toHaveLength(0);
  });
});

describe('paged <-> infinite', () => {
  const p0 = [
    stroke('a', [
      [10, 10],
      [20, 20],
    ]),
  ];
  const p1 = [
    stroke('b', [
      [30, 40],
      [50, 60],
    ]),
  ];

  it('stacks pages and splits them back without losing anything', () => {
    const infinite = pagesToInfinite([p0, p1]);
    expect(infinite).toHaveLength(2);
    expect(elementBounds(infinite[1] as Element).minY).toBeGreaterThan(PAGE_HEIGHT);
    const { pages, outside } = infiniteToPages(infinite);
    expect(outside).toBe(0);
    expect(pages).toEqual([p0, p1]);
  });

  it('reports content that falls outside page bounds', () => {
    const { pages, outside } = infiniteToPages([
      stroke('wide', [
        [-50, 10],
        [1200, 10],
      ]),
    ]);
    expect(outside).toBe(1);
    expect(pages[0]).toHaveLength(1);
  });

  it('keeps empty pages between content and returns one empty page for an empty canvas', () => {
    const { pages } = infiniteToPages([
      stroke('far', [
        [10, 2 * (PAGE_HEIGHT + PAGE_GAP) + 10],
        [20, 2 * (PAGE_HEIGHT + PAGE_GAP) + 20],
      ]),
    ]);
    expect(pages.map((p) => p.length)).toEqual([0, 0, 1]);
    expect(infiniteToPages([]).pages).toEqual([[]]);
  });
});

describe('save state', () => {
  it('maps inputs to the Saved chip', () => {
    expect(saveStatus({ dirty: 0, inFlight: 0, failed: false, online: true })).toBe('saved');
    expect(saveStatus({ dirty: 1, inFlight: 0, failed: false, online: true })).toBe('saving');
    expect(saveStatus({ dirty: 0, inFlight: 1, failed: false, online: false })).toBe('offline');
    expect(saveStatus({ dirty: 0, inFlight: 0, failed: true, online: true })).toBe('error');
  });

  it('backs off and then gives up', () => {
    expect([0, 1, 2, 3, 4].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, null]);
  });

  it('estimates stored size', () => {
    expect(estimateBytes([{ a: 'é' }])).toBe(12);
  });
});
