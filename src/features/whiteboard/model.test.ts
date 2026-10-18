import { describe, expect, it } from 'vitest';
import { type Point, decodePoints, encodePoints, simplify, unionBounds } from './model';

describe('point encoding', () => {
  it('round-trips points at integer precision', () => {
    const pts: Point[] = [
      { x: 10.4, y: 20.6, p: 0.5 },
      { x: 12, y: 25, p: 0.75 },
      { x: 999, y: 1413, p: 1 },
      { x: 0, y: 0, p: 0 },
    ];
    expect(decodePoints(encodePoints(pts))).toEqual([
      { x: 10, y: 21, p: 0.5 },
      { x: 12, y: 25, p: 0.75 },
      { x: 999, y: 1413, p: 1 },
      { x: 0, y: 0, p: 0 },
    ]);
  });

  it('handles negative coordinates (infinite canvas) and empty strokes', () => {
    const pts = [
      { x: -5000, y: 3000, p: 1 },
      { x: 4000, y: -2000, p: 1 },
    ];
    expect(decodePoints(encodePoints(pts))).toEqual(pts);
    expect(decodePoints(encodePoints([]))).toEqual([]);
  });

  it('is compact: 6 bytes per point before base64', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2, p: 1 }));
    expect(encodePoints(pts).length).toBe(800);
  });

  it('a page with 1000 strokes of 50 points stays far below 1 MB', () => {
    const stroke = Array.from({ length: 50 }, (_, i) => ({ x: 100 + i, y: 200 + (i % 7), p: 0.6 }));
    const size = encodePoints(stroke).length * 1000;
    expect(size).toBeLessThan(500_000);
  });
});

describe('simplify', () => {
  it('drops collinear points and keeps corners', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0, p: 1 }));
    expect(simplify(line)).toHaveLength(2);
    const corner = [...line, ...Array.from({ length: 50 }, (_, i) => ({ x: 49, y: i + 1, p: 1 }))];
    expect(simplify(corner).map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [49, 0],
      [49, 50],
    ]);
  });
});

describe('unionBounds', () => {
  it('covers strokes, shapes, and text', () => {
    expect(unionBounds([])).toBeNull();
    const b = unionBounds([
      {
        kind: 'stroke',
        id: 'a',
        tool: 'pen',
        color: '#000000',
        width: 4,
        opacity: 1,
        points: [{ x: 10, y: 10, p: 1 }],
      },
      { kind: 'shape', id: 'b', shape: 'rect', color: '#000000', width: 2, x1: 100, y1: 50, x2: 20, y2: 200 },
    ]);
    expect(b).toEqual({ minX: 8, minY: 8, maxX: 101, maxY: 201 });
  });
});
