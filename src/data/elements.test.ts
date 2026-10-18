import { describe, expect, it } from 'vitest';
import type { Element } from '../features/whiteboard/model';
import { fromStored, parseElements, toStored } from './elements';

const samples: Element[] = [
  {
    kind: 'stroke',
    id: 's1',
    tool: 'pen',
    color: '#0f2a4a',
    width: 3,
    opacity: 1,
    points: [
      { x: 1, y: 2, p: 0.5 },
      { x: 3, y: 4, p: 1 },
    ],
  },
  { kind: 'shape', id: 'h1', shape: 'arrow', color: '#1270c4', width: 2, x1: 0, y1: 0, x2: 10, y2: 10 },
  {
    kind: 'text',
    id: 't1',
    color: '#0f2a4a',
    font: 'hand',
    size: 28,
    x: 5,
    y: 6,
    boxWidth: 300,
    text: 'F = ma',
  },
];

describe('stored elements', () => {
  it('round-trip', () => {
    for (const el of samples) expect(fromStored(toStored(el))).toEqual(el);
  });

  it('drop malformed or hostile entries instead of failing the page', () => {
    const good = toStored(samples[1] as Element);
    expect(
      parseElements([
        good,
        { k: 's', id: 'x', tool: 'pen', c: 'red', w: 3, o: 1, pts: '' },
        { k: 't', id: 'y', c: '#000000', f: 'comic', s: 10, x: 0, y: 0, bw: 100, v: 'x' },
        { k: 'z' },
        null,
        '<script>',
      ]),
    ).toEqual([samples[1]]);
    expect(parseElements('nope')).toEqual([]);
  });
});
