import { AI_MAX_IMAGE_CHARS } from '../../shared/schemas';
import { type Element, unionBounds } from './model';
import { drawElements } from './render';

/**
 * Renders ONLY the given elements (e.g. the lasso selection) to a PNG data URL,
 * cropped to their bounds on white, for handwriting recognition. Scales down
 * until it fits the AI size limit. Returns null when there is nothing to send.
 */
export function elementsToPng(elements: Element[], maxSide = 1400): string | null {
  const b = unionBounds(elements);
  if (!b) return null;
  const pad = 24;
  const width = b.maxX - b.minX + pad * 2;
  const height = b.maxY - b.minY + pad * 2;
  for (let side = maxSide; side >= 200; side = Math.round(side * 0.7)) {
    const scale = Math.min(2, side / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawElements(ctx, elements, { scale, offsetX: (pad - b.minX) * scale, offsetY: (pad - b.minY) * scale });
    const url = canvas.toDataURL('image/png');
    if (url.length <= AI_MAX_IMAGE_CHARS) return url;
  }
  return null;
}
