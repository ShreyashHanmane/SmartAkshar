import type { Element } from '../features/whiteboard/model';
import { decodePoints, encodePoints } from '../features/whiteboard/model';
import { type StoredElement, storedElement } from '../shared/schemas';

export { storedElement, type StoredElement };

/** Converts editor elements to the stored format (short keys, packed points) and back. */
export function toStored(el: Element): StoredElement {
  if (el.kind === 'stroke')
    return { k: 's', id: el.id, tool: el.tool, c: el.color, w: el.width, o: el.opacity, pts: encodePoints(el.points) };
  if (el.kind === 'shape')
    return { k: 'h', id: el.id, shape: el.shape, c: el.color, w: el.width, x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2 };
  return { k: 't', id: el.id, c: el.color, f: el.font, s: el.size, x: el.x, y: el.y, bw: el.boxWidth, v: el.text };
}

export function fromStored(raw: unknown): Element | null {
  const parsed = storedElement.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (s.k === 's') {
    try {
      return { kind: 'stroke', id: s.id, tool: s.tool, color: s.c, width: s.w, opacity: s.o, points: decodePoints(s.pts) };
    } catch {
      return null;
    }
  }
  if (s.k === 'h') return { kind: 'shape', id: s.id, shape: s.shape, color: s.c, width: s.w, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
  return { kind: 'text', id: s.id, color: s.c, font: s.f, size: s.s, x: s.x, y: s.y, boxWidth: s.bw, text: s.v };
}

export function parseElements(raw: unknown): Element[] {
  return Array.isArray(raw) ? raw.flatMap((r) => fromStored(r) ?? []) : [];
}
