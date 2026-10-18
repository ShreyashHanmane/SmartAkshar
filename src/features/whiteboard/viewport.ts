import { PAGE_HEIGHT, PAGE_WIDTH } from './model';
import type { View } from './render';

/** User-controlled part of the view: zoom factor and pan in CSS pixels. */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

/** Screen area left for the page after the toolbar and bars (CSS pixels). */
export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 6;
export const PAGE_PADDING = 16;
export const FIT: ViewState = { zoom: 1, panX: 0, panY: 0 };

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Zoom 1 view: paged fits the whole page in the area; infinite is 1:1 at the area origin. */
export function baseView(mode: 'paged' | 'infinite', area: Area): View {
  if (mode === 'infinite') return { scale: 1, offsetX: area.left, offsetY: area.top };
  const scale = Math.max(
    0.01,
    Math.min((area.width - PAGE_PADDING * 2) / PAGE_WIDTH, (area.height - PAGE_PADDING * 2) / PAGE_HEIGHT),
  );
  return {
    scale,
    offsetX: area.left + (area.width - PAGE_WIDTH * scale) / 2,
    offsetY: area.top + (area.height - PAGE_HEIGHT * scale) / 2,
  };
}

/** Final logical -> CSS pixel mapping. Zoom scales about the area centre. */
export function computeView(mode: 'paged' | 'infinite', area: Area, state: ViewState): View {
  const base = baseView(mode, area);
  const cx = area.left + area.width / 2;
  const cy = area.top + area.height / 2;
  return {
    scale: base.scale * state.zoom,
    offsetX: cx + (base.offsetX - cx) * state.zoom + state.panX,
    offsetY: cy + (base.offsetY - cy) * state.zoom + state.panY,
  };
}

export function toLogical(view: View, sx: number, sy: number) {
  return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
}

/** New view state after zooming by `factor` while keeping screen point (sx, sy) fixed. */
export function zoomAt(
  mode: 'paged' | 'infinite',
  area: Area,
  state: ViewState,
  factor: number,
  sx: number,
  sy: number,
): ViewState {
  const zoom = clampZoom(state.zoom * factor);
  const before = computeView(mode, area, state);
  const logical = toLogical(before, sx, sy);
  const unpanned = computeView(mode, area, { zoom, panX: 0, panY: 0 });
  return {
    zoom,
    panX: sx - logical.x * unpanned.scale - unpanned.offsetX,
    panY: sy - logical.y * unpanned.scale - unpanned.offsetY,
  };
}

/** CSS transform that maps a bitmap rendered with `from` onto view `to` (used during gestures). */
export function bitmapTransform(from: View, to: View): string {
  const k = to.scale / from.scale;
  return `translate(${to.offsetX - from.offsetX * k}px, ${to.offsetY - from.offsetY * k}px) scale(${k})`;
}
