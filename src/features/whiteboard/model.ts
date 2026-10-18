/**
 * Whiteboard document model.
 *
 * Paged notebooks store every element in a fixed logical coordinate space
 * (PAGE_WIDTH x PAGE_HEIGHT, A4 portrait ratio). Each device scales that space
 * to fit, so handwriting and exports look identical everywhere. Infinite
 * notebooks use the same units without page bounds.
 *
 * Stroke points are packed as base64 of little-endian Int16 deltas
 * (x, y, pressure) to keep a page document far below Firestore's 1 MB limit.
 */

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1414;
/** Max coordinate magnitude representable in Int16 after rounding. */
const COORD_LIMIT = 32767;

export type Tool = 'pen' | 'highlighter';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';
export type FontKind = 'sans' | 'serif' | 'hand';

export interface Point {
  x: number;
  y: number;
  /** Pressure 0..1 (1 when the device has none). */
  p: number;
}

export interface StrokeElement {
  kind: 'stroke';
  id: string;
  tool: Tool;
  color: string;
  /** Pen: line width in logical units. Highlighter: width, drawn at `opacity`. */
  width: number;
  opacity: number;
  points: Point[];
}

export interface ShapeElement {
  kind: 'shape';
  id: string;
  shape: ShapeKind;
  color: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextElement {
  kind: 'text';
  id: string;
  color: string;
  font: FontKind;
  size: number;
  x: number;
  y: number;
  /** Wrap width in logical units. */
  boxWidth: number;
  text: string;
}

export type Element = StrokeElement | ShapeElement | TextElement;

function clampCoord(n: number): number {
  return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(n)));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Packs points as Int16 triples: first absolute, then deltas. Pressure is stored 0..1000. */
export function encodePoints(points: Point[]): string {
  const view = new DataView(new ArrayBuffer(points.length * 6));
  let px = 0;
  let py = 0;
  points.forEach((pt, i) => {
    const x = clampCoord(pt.x);
    const y = clampCoord(pt.y);
    const dx = i === 0 ? x : Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, x - px));
    const dy = i === 0 ? y : Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, y - py));
    px = i === 0 ? x : px + dx;
    py = i === 0 ? y : py + dy;
    view.setInt16(i * 6, dx, true);
    view.setInt16(i * 6 + 2, dy, true);
    view.setInt16(i * 6 + 4, Math.round(Math.max(0, Math.min(1, pt.p)) * 1000), true);
  });
  return toBase64(new Uint8Array(view.buffer));
}

export function decodePoints(text: string): Point[] {
  const bytes = fromBase64(text);
  const count = Math.floor(bytes.length / 6);
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 6);
  const out: Point[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    const dx = view.getInt16(i * 6, true);
    const dy = view.getInt16(i * 6 + 2, true);
    x = i === 0 ? dx : x + dx;
    y = i === 0 ? dy : y + dy;
    out.push({ x, y, p: view.getInt16(i * 6 + 4, true) / 1000 });
  }
  return out;
}

/**
 * Ramer–Douglas–Peucker simplification in logical units. Keeps the shape of
 * handwriting while dropping redundant points from fast pointer streams.
 */
export function simplify(points: Point[], tolerance = 0.6): Point[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop() as [number, number];
    const a = points[start] as Point;
    const b = points[end] as Point;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i] as Point;
      const dist = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function elementBounds(el: Element): Bounds {
  if (el.kind === 'stroke') {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = el.width / 2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }
  if (el.kind === 'shape') {
    const pad = el.width / 2;
    return {
      minX: Math.min(el.x1, el.x2) - pad,
      minY: Math.min(el.y1, el.y2) - pad,
      maxX: Math.max(el.x1, el.x2) + pad,
      maxY: Math.max(el.y1, el.y2) + pad,
    };
  }
  const lines = Math.max(1, el.text.split('\n').length);
  return { minX: el.x, minY: el.y, maxX: el.x + el.boxWidth, maxY: el.y + lines * el.size * 1.3 };
}

export function unionBounds(elements: Element[]): Bounds | null {
  if (elements.length === 0) return null;
  return elements.map(elementBounds).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}
