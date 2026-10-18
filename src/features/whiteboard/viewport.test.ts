import { describe, expect, it } from 'vitest';
import { PAGE_HEIGHT, PAGE_WIDTH } from './model';
import { FIT, PAGE_PADDING, bitmapTransform, computeView, toLogical, zoomAt } from './viewport';

const area = { left: 80, top: 56, width: 800, height: 900 };

describe('viewport', () => {
  it('fits the whole page inside the area (never under the toolbar)', () => {
    const v = computeView('paged', area, FIT);
    const left = v.offsetX;
    const right = v.offsetX + PAGE_WIDTH * v.scale;
    const top = v.offsetY;
    const bottom = v.offsetY + PAGE_HEIGHT * v.scale;
    expect(left).toBeGreaterThanOrEqual(area.left);
    expect(right).toBeLessThanOrEqual(area.left + area.width);
    expect(top).toBeGreaterThanOrEqual(area.top + PAGE_PADDING - 0.001);
    expect(bottom).toBeLessThanOrEqual(area.top + area.height - PAGE_PADDING + 0.001);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    for (const mode of ['paged', 'infinite'] as const) {
      const before = computeView(mode, area, FIT);
      const sx = 400;
      const sy = 300;
      const target = toLogical(before, sx, sy);
      const next = zoomAt(mode, area, FIT, 2, sx, sy);
      const after = computeView(mode, area, next);
      expect(after.scale).toBeCloseTo(before.scale * 2);
      expect(target.x * after.scale + after.offsetX).toBeCloseTo(sx);
      expect(target.y * after.scale + after.offsetY).toBeCloseTo(sy);
    }
  });

  it('clamps zoom', () => {
    expect(zoomAt('paged', area, FIT, 1000, 0, 0).zoom).toBe(6);
    expect(zoomAt('paged', area, FIT, 0.0001, 0, 0).zoom).toBe(0.25);
  });

  it('maps a rendered bitmap onto a new view', () => {
    expect(
      bitmapTransform({ scale: 1, offsetX: 10, offsetY: 20 }, { scale: 2, offsetX: 30, offsetY: 40 }),
    ).toBe('translate(10px, 0px) scale(2)');
  });
});
