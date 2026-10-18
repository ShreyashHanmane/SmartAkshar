/**
 * Minimal PDF writer: each page is one full-page image (RGB, Flate-compressed,
 * lossless). Whiteboard pages and laid-out notes are rendered to a canvas
 * first, so handwriting, every script and all three fonts look exactly as on
 * screen. No dependencies.
 */

export interface PdfImage {
  width: number;
  height: number;
  /** zlib-compressed (FlateDecode) RGB bytes, 3 per pixel, row by row. */
  data: Uint8Array;
}

export interface PdfPage {
  /** Page size in PDF points (1/72 inch). */
  widthPt: number;
  heightPt: number;
  image: PdfImage;
}

/** A4 in points. */
export const A4 = { width: 595.28, height: 841.89 };

const encoder = new TextEncoder();

/** PDF text string that survives any script: UTF-16BE with a byte-order mark, hex-encoded. */
export function pdfText(value: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex.toUpperCase()}>`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

export function buildPdf(pages: PdfPage[], title?: string): Uint8Array<ArrayBuffer> {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | (string | Uint8Array)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const part of Array.isArray(body) ? body : [body]) push(part);
    push('\nendobj\n');
  };

  // Binary marker comment so tools treat the file as binary.
  push('%PDF-1.4\n%âãÏÓ\n');
  const pageIds = pages.map((_, i) => 4 + i * 3);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  object(3, `<< /Producer ${pdfText('AKSHAR')}${title ? ` /Title ${pdfText(title)}` : ''} >>`);
  pages.forEach((page, i) => {
    const id = pageIds[i] as number;
    const w = num(page.widthPt);
    const h = num(page.heightPt);
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(id + 1, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    object(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${page.image.data.length} >>\nstream\n`,
      page.image.data,
      '\nendstream',
    ]);
  });

  const count = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** zlib-compresses RGBA pixels into the RGB stream a PDF image expects (alpha over white). */
export async function rgbaToPdfImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<PdfImage> {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = (rgba[i + 3] as number) / 255;
    rgb[j] = Math.round((rgba[i] as number) * a + 255 * (1 - a));
    rgb[j + 1] = Math.round((rgba[i + 1] as number) * a + 255 * (1 - a));
    rgb[j + 2] = Math.round((rgba[i + 2] as number) * a + 255 * (1 - a));
  }
  const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  return { width, height, data };
}
