import { type Element, type Point, type ShapeElement, type StrokeElement, type TextElement } from './model';
import { PAPER_BACKGROUNDS, PATTERN_GAP, type PaperBackground, type PaperStyle, patternColor } from './paper';

/** Maps logical units to canvas pixels: canvas = logical * scale + offset. */
export interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const FONT_FAMILY: Record<TextElement['font'], string> = {
  sans: '"Noto Sans", system-ui, sans-serif',
  serif: '"Noto Serif", Georgia, "Times New Roman", serif',
  hand: '"Caveat", "Segoe Print", "Bradley Hand", cursive',
};

function applyView(ctx: CanvasRenderingContext2D, view: View) {
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
}

function drawStroke(ctx: CanvasRenderingContext2D, el: StrokeElement) {
  const pts = el.points;
  if (pts.length === 0) return;
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = el.tool === 'highlighter' ? el.opacity : 1;

  const first = pts[0] as Point;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, el.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  if (el.tool === 'highlighter') {
    // One path, constant width: overlapping segments must not darken.
    ctx.lineWidth = el.width;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i] as Point;
      const b = pts[i + 1] as Point;
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const last = pts[pts.length - 1] as Point;
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // Pen: smooth quadratic segments through midpoints, width follows pressure.
  let prevMid = { x: first.x, y: first.y };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    const mid = i === pts.length - 1 ? { x: b.x, y: b.y } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.lineWidth = el.width * (0.45 + 0.55 * ((a.p + b.p) / 2));
    ctx.beginPath();
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
    ctx.stroke();
    prevMid = mid;
  }
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  ctx.globalAlpha = 1;
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const { x1, y1, x2, y2 } = el;
  if (el.shape === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  else if (el.shape === 'ellipse')
    ctx.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.abs(x2 - x1) / 2,
      Math.abs(y2 - y1) / 2,
      0,
      0,
      Math.PI * 2,
    );
  else {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (el.shape === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(12, el.width * 4);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
    }
  }
  ctx.stroke();
}

/** Splits text into lines that fit `maxWidth` (explicit newlines kept). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (line && ctx.measureText(candidate).width > maxWidth && word.trim()) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line = candidate;
    }
    out.push(line);
  }
  return out;
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = el.color;
  ctx.font = `${el.size}px ${FONT_FAMILY[el.font]}`;
  ctx.textBaseline = 'top';
  wrapText(ctx, el.text, el.boxWidth).forEach((line, i) =>
    ctx.fillText(line, el.x, el.y + i * el.size * 1.3),
  );
}

export function drawElement(ctx: CanvasRenderingContext2D, el: Element) {
  if (el.kind === 'stroke') drawStroke(ctx, el);
  else if (el.kind === 'shape') drawShape(ctx, el);
  else drawText(ctx, el);
}

export function drawElements(ctx: CanvasRenderingContext2D, elements: Element[], view: View) {
  ctx.save();
  applyView(ctx, view);
  for (const el of elements) drawElement(ctx, el);
  ctx.restore();
}

/** Fills the background and draws the paper pattern over a logical rectangle. */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  style: PaperStyle,
  background: PaperBackground,
  rect: { x: number; y: number; width: number; height: number },
  view: View,
) {
  ctx.save();
  applyView(ctx, view);
  ctx.fillStyle = PAPER_BACKGROUNDS[background];
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.strokeStyle = patternColor(background);
  ctx.fillStyle = patternColor(background);
  const startX = Math.floor(rect.x / PATTERN_GAP) * PATTERN_GAP;
  const startY = Math.floor(rect.y / PATTERN_GAP) * PATTERN_GAP;
  const endX = rect.x + rect.width;
  const endY = rect.y + rect.height;
  ctx.lineWidth = 1 / Math.max(view.scale, 0.0001);
  if (style === 'dots') {
    const r = Math.max(1.4, 1.2 / view.scale);
    for (let x = startX; x <= endX; x += PATTERN_GAP)
      for (let y = startY; y <= endY; y += PATTERN_GAP) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (style === 'grid' || style === 'lines') {
    ctx.beginPath();
    for (let y = startY; y <= endY; y += PATTERN_GAP) {
      ctx.moveTo(rect.x, y);
      ctx.lineTo(endX, y);
    }
    if (style === 'grid')
      for (let x = startX; x <= endX; x += PATTERN_GAP) {
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, endY);
      }
    ctx.stroke();
  }
  ctx.restore();
}

/** View that fits a logical rectangle inside a canvas of the given pixel size (centered). */
export function fitView(
  rect: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  padding = 0,
): View {
  const scale = Math.min(
    (canvasWidth - padding * 2) / rect.width,
    (canvasHeight - padding * 2) / rect.height,
  );
  return {
    scale,
    offsetX: (canvasWidth - rect.width * scale) / 2 - rect.x * scale,
    offsetY: (canvasHeight - rect.height * scale) / 2 - rect.y * scale,
  };
}
