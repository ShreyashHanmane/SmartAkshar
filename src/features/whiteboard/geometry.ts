import { type Element, type Point, elementBounds } from './model';

type XY = { x: number; y: number };

/** Ray-casting point-in-polygon. */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as XY;
    const b = poly[j] as XY;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Whether a loop drawn with the lasso or the eraser encloses an element.
 * Strokes: at least half of their points are inside. Shapes and text: their centre is inside.
 */
export function enclosed(el: Element, loop: XY[]): boolean {
  if (loop.length < 3) return false;
  if (el.kind === 'stroke') {
    if (el.points.length === 0) return false;
    const inside = el.points.filter((p) => pointInPolygon(p, loop)).length;
    return inside * 2 >= el.points.length;
  }
  const b = elementBounds(el);
  return pointInPolygon({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, loop);
}

export function selectInLoop(elements: Element[], loop: XY[]): Set<string> {
  return new Set(elements.filter((el) => enclosed(el, loop)).map((el) => el.id));
}

export function translate(el: Element, dx: number, dy: number): Element {
  if (el.kind === 'stroke')
    return { ...el, points: el.points.map((p: Point) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  if (el.kind === 'shape') return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function moveSelected(elements: Element[], ids: Set<string>, dx: number, dy: number): Element[] {
  return elements.map((el) => (ids.has(el.id) ? translate(el, dx, dy) : el));
}

export function removeSelected(elements: Element[], ids: Set<string>): Element[] {
  return elements.filter((el) => !ids.has(el.id));
}

/** Topmost text element whose box contains the point (for editing with the text tool). */
export function textAt(elements: Element[], p: XY): Extract<Element, { kind: 'text' }> | undefined {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el?.kind !== 'text') continue;
    const b = elementBounds(el);
    if (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY) return el;
  }
  return undefined;
}

/** Path length, used to tell a deliberate loop from a tap. */
export function pathLength(points: XY[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as XY;
    const b = points[i] as XY;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}
