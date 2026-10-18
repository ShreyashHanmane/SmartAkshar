import { z } from 'zod';
import { type Element, decodePoints, encodePoints } from '../features/whiteboard/model';

/**
 * Firestore storage format for whiteboard elements (short keys, packed points).
 * Parsing drops malformed elements instead of failing the whole page.
 */
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const coord = z.number().finite().min(-32767).max(32767);

const storedStroke = z.object({
  k: z.literal('s'),
  id: z.string().min(1).max(40),
  tool: z.enum(['pen', 'highlighter']),
  c: color,
  w: z.number().min(0.5).max(80),
  o: z.number().min(0.05).max(1),
  pts: z.string().max(200_000),
});
const storedShape = z.object({
  k: z.literal('h'),
  id: z.string().min(1).max(40),
  shape: z.enum(['rect', 'ellipse', 'line', 'arrow']),
  c: color,
  w: z.number().min(0.5).max(80),
  x1: coord,
  y1: coord,
  x2: coord,
  y2: coord,
});
const storedText = z.object({
  k: z.literal('t'),
  id: z.string().min(1).max(40),
  c: color,
  f: z.enum(['sans', 'serif', 'hand']),
  s: z.number().min(6).max(200),
  x: coord,
  y: coord,
  bw: z.number().min(20).max(5000),
  v: z.string().max(5000),
});
export const storedElement = z.discriminatedUnion('k', [storedStroke, storedShape, storedText]);
export type StoredElement = z.infer<typeof storedElement>;

export function toStored(el: Element): StoredElement {
  if (el.kind === 'stroke')
    return {
      k: 's',
      id: el.id,
      tool: el.tool,
      c: el.color,
      w: el.width,
      o: el.opacity,
      pts: encodePoints(el.points),
    };
  if (el.kind === 'shape')
    return {
      k: 'h',
      id: el.id,
      shape: el.shape,
      c: el.color,
      w: el.width,
      x1: el.x1,
      y1: el.y1,
      x2: el.x2,
      y2: el.y2,
    };
  return {
    k: 't',
    id: el.id,
    c: el.color,
    f: el.font,
    s: el.size,
    x: el.x,
    y: el.y,
    bw: el.boxWidth,
    v: el.text,
  };
}

export function fromStored(raw: unknown): Element | null {
  const parsed = storedElement.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (s.k === 's') {
    try {
      return {
        kind: 'stroke',
        id: s.id,
        tool: s.tool,
        color: s.c,
        width: s.w,
        opacity: s.o,
        points: decodePoints(s.pts),
      };
    } catch {
      return null;
    }
  }
  if (s.k === 'h')
    return {
      kind: 'shape',
      id: s.id,
      shape: s.shape,
      color: s.c,
      width: s.w,
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
    };
  return {
    kind: 'text',
    id: s.id,
    color: s.c,
    font: s.f,
    size: s.s,
    x: s.x,
    y: s.y,
    boxWidth: s.bw,
    text: s.v,
  };
}

export function parseElements(raw: unknown): Element[] {
  return Array.isArray(raw) ? raw.flatMap((r) => fromStored(r) ?? []) : [];
}
