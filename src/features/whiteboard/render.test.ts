import { describe, expect, it } from 'vitest';
import { PAGE_HEIGHT, PAGE_WIDTH } from './model';
import { fitView } from './render';

describe('fitView', () => {
  it('scales a page to fit a canvas and centres it', () => {
    const page = { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT };
    const view = fitView(page, 500, 1000);
    expect(view.scale).toBeCloseTo(0.5);
    expect(view.offsetX).toBeCloseTo(0);
    expect(view.offsetY).toBeCloseTo((1000 - PAGE_HEIGHT * 0.5) / 2);
  });

  it('gives identical relative positions at any device size (fixed logical space)', () => {
    const page = { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT };
    for (const [w, h] of [
      [390, 844],
      [820, 1180],
      [1440, 900],
    ] as const) {
      const v = fitView(page, w, h);
      const px = 500 * v.scale + v.offsetX;
      const left = v.offsetX;
      const right = PAGE_WIDTH * v.scale + v.offsetX;
      expect((px - left) / (right - left)).toBeCloseTo(0.5);
    }
  });

  it('handles offset rectangles (infinite canvas bounds)', () => {
    const v = fitView({ x: -200, y: -100, width: 400, height: 200 }, 400, 200);
    expect(v.scale).toBeCloseTo(1);
    expect(-200 * v.scale + v.offsetX).toBeCloseTo(0);
  });
});
