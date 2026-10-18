import { loadNoteImage } from '../../data/notes';
import type { Notebook } from '../../data/notebooks';
import type { JsonNode } from '../../shared/clean';
import { sniffImage } from '../../shared/images';
import { type Element, PAGE_HEIGHT, PAGE_WIDTH, unionBounds } from '../whiteboard/model';
import { drawElements, drawPaper, ensureFonts } from '../whiteboard/render';
import { cardsCsv, type CsvCard } from './csv';
import { type DocxImage, buildDocx } from './docx';
import { type Op, PAGE, cssFont, layoutNotes, noteImages } from './notesLayout';
import { A4, type PdfPage, buildPdf, rgbaToPdfImage } from './pdf';

export type Progress = (done: number, total: number) => void;

/** Logical whiteboard units to PDF points: a paged page is exactly A4. */
const PT_PER_UNIT = A4.width / PAGE_WIDTH;
/** Largest page side a PDF allows (200 inches). */
const MAX_PDF_SIDE = 14_400;
/** Pixel budget per rendered page: sharp text without exhausting memory on tablets. */
const MAX_PIXELS = 16_000_000;
const MAX_CANVAS_SIDE = 8192;

/** File names: no path or reserved characters, not too long, never empty. */
export function safeFileName(title: string, ext: string): string {
  const base = title
    // eslint-disable-next-line no-control-regex -- control characters are not allowed in file names
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 80);
  return `${base || 'akshar'}.${ext}`;
}

export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the data.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lets the browser paint (progress) between heavy steps. */
const breathe = () => new Promise((r) => window.setTimeout(r, 0));

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The logical area a whiteboard page exports: the page itself, or the drawing's bounds in infinite mode. */
function pageArea(elements: Element[], mode: Notebook['mode']): Area {
  if (mode === 'paged') return { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT };
  const b = unionBounds(elements);
  if (!b) return { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT };
  const pad = 48;
  return {
    x: b.minX - pad,
    y: b.minY - pad,
    width: b.maxX - b.minX + pad * 2,
    height: b.maxY - b.minY + pad * 2,
  };
}

function canvasFor(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  return { canvas, ctx };
}

/** Renders one whiteboard page (paper + content) at print resolution. */
async function renderWhiteboardPage(
  elements: Element[],
  notebook: Notebook,
): Promise<{ canvas: HTMLCanvasElement; area: Area }> {
  await ensureFonts(elements);
  const area = pageArea(elements, notebook.mode);
  const scale = Math.min(
    2,
    Math.sqrt(MAX_PIXELS / (area.width * area.height)),
    MAX_CANVAS_SIDE / Math.max(area.width, area.height),
  );
  const { canvas, ctx } = canvasFor(area.width * scale, area.height * scale);
  const view = { scale, offsetX: -area.x * scale, offsetY: -area.y * scale };
  drawPaper(ctx, notebook.paper, notebook.background, area, view);
  drawElements(ctx, elements, view);
  return { canvas, area };
}

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type),
  );

async function canvasToPdfPage(
  canvas: HTMLCanvasElement,
  widthPt: number,
  heightPt: number,
): Promise<PdfPage> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const image = await rgbaToPdfImage(pixels, canvas.width, canvas.height);
  canvas.width = 0; // free the pixels early on memory-constrained tablets
  return { widthPt, heightPt, image };
}

export async function whiteboardPng(elements: Element[], notebook: Notebook): Promise<Blob> {
  const { canvas } = await renderWhiteboardPage(elements, notebook);
  return toBlob(canvas, 'image/png');
}

export async function whiteboardPdf(
  pages: Element[][],
  notebook: Notebook,
  progress?: Progress,
): Promise<Blob> {
  const out: PdfPage[] = [];
  for (const [i, elements] of pages.entries()) {
    progress?.(i, pages.length);
    await breathe();
    const { canvas, area } = await renderWhiteboardPage(elements, notebook);
    const factor = Math.min(PT_PER_UNIT, MAX_PDF_SIDE / Math.max(area.width, area.height));
    out.push(await canvasToPdfPage(canvas, area.width * factor, area.height * factor));
  }
  progress?.(pages.length, pages.length);
  return new Blob([buildPdf(out, notebook.title)], { type: 'application/pdf' });
}

async function loadBitmaps(srcs: string[]): Promise<Map<string, ImageBitmap>> {
  const out = new Map<string, ImageBitmap>();
  for (const src of srcs) {
    try {
      const blob = await loadNoteImage(src);
      if (blob) out.set(src, await createImageBitmap(blob));
    } catch {
      // A missing or broken image is left out of the export rather than failing it.
    }
  }
  return out;
}

function paintOps(ctx: CanvasRenderingContext2D, ops: Op[], images: Map<string, ImageBitmap>, scale: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);
  ctx.textBaseline = 'alphabetic';
  for (const op of ops) {
    if (op.kind === 'rect') {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.kind === 'text') {
      ctx.font = cssFont(op.style);
      ctx.fillStyle = op.style.color;
      ctx.fillText(op.text, op.x, op.y);
    } else {
      const img = images.get(op.src);
      if (img) ctx.drawImage(img, op.x, op.y, op.w, op.h);
    }
  }
}

/** `doc` is the editor's current (cleaned) content, so unsaved edits are included. */
export async function notesPdf(doc: JsonNode, title: string, progress?: Progress): Promise<Blob> {
  const images = await loadBitmaps(noteImages(doc));
  await document.fonts?.ready;
  const scale = 2;
  const { ctx: measureCtx } = canvasFor(1, 1);
  const pages = layoutNotes(
    doc,
    title,
    (text, style) => {
      measureCtx.font = cssFont(style);
      return measureCtx.measureText(text).width;
    },
    (src) => {
      const img = images.get(src);
      return img ? { width: img.width, height: img.height } : null;
    },
  );
  const out: PdfPage[] = [];
  for (const [i, ops] of pages.entries()) {
    progress?.(i, pages.length);
    await breathe();
    const { canvas, ctx } = canvasFor(PAGE.width * scale, PAGE.height * scale);
    paintOps(ctx, ops, images, scale);
    out.push(await canvasToPdfPage(canvas, A4.width, A4.height));
  }
  progress?.(pages.length, pages.length);
  for (const img of images.values()) img.close();
  return new Blob([buildPdf(out, title)], { type: 'application/pdf' });
}

/** Word supports PNG, JPEG and GIF; other images (WebP) are converted to PNG. */
async function docxImage(src: string): Promise<DocxImage | null> {
  const blob = await loadNoteImage(src);
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const size = { width: bitmap.width, height: bitmap.height };
    if (kind === 'png' || kind === 'gif') return { data: bytes, type: kind, ...size };
    if (kind === 'jpeg') return { data: bytes, type: 'jpeg', ...size };
    const { canvas, ctx } = canvasFor(size.width, size.height);
    ctx.drawImage(bitmap, 0, 0);
    const png = new Uint8Array(await (await toBlob(canvas, 'image/png')).arrayBuffer());
    return { data: png, type: 'png', ...size };
  } finally {
    bitmap.close();
  }
}

export async function notesDocx(doc: JsonNode, title: string): Promise<Blob> {
  const bytes = await buildDocx(doc, title, docxImage);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function deckCsv(deckTitle: string, cards: CsvCard[]): Blob {
  return new Blob([cardsCsv(deckTitle, cards)], { type: 'text/csv;charset=utf-8' });
}
