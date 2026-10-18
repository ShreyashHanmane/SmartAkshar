import { translate } from './geometry';
import { type Element, PAGE_HEIGHT, PAGE_WIDTH, elementBounds } from './model';

/** Vertical gap between pages when they are laid out on the infinite canvas. */
export const PAGE_GAP = 80;
const STRIDE = PAGE_HEIGHT + PAGE_GAP;

/** Paged → Infinite: stacks pages vertically on one canvas, exactly as they looked. Nothing is dropped. */
export function pagesToInfinite(pages: Element[][]): Element[] {
  return pages.flatMap((elements, index) =>
    index === 0 ? elements : elements.map((el) => translate(el, 0, index * STRIDE)),
  );
}

/**
 * Infinite → Paged: each element goes to the page band its top edge falls in
 * (shifted back into page coordinates). Elements wider than a page stay whole;
 * `outside` counts elements that extend past the page edges, so the UI can warn.
 */
export function infiniteToPages(elements: Element[]): { pages: Element[][]; outside: number } {
  const pages: Element[][] = [];
  let outside = 0;
  for (const el of elements) {
    const b = elementBounds(el);
    const index = Math.max(0, Math.min(499, Math.floor(Math.max(0, b.minY) / STRIDE)));
    const moved = index === 0 ? el : translate(el, 0, -index * STRIDE);
    const mb = elementBounds(moved);
    if (mb.minX < 0 || mb.maxX > PAGE_WIDTH || mb.minY < 0 || mb.maxY > PAGE_HEIGHT) outside++;
    (pages[index] ??= []).push(moved);
  }
  if (pages.length === 0) pages.push([]);
  for (let i = 0; i < pages.length; i++) pages[i] ??= [];
  return { pages, outside };
}
