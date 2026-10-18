import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { A4, buildPdf, pdfText, rgbaToPdfImage } from './pdf';

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('pdf writer', () => {
  it('converts RGBA to RGB over white', async () => {
    // Opaque red, then fully transparent (becomes white), then half-transparent black.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 9, 9, 9, 0, 0, 0, 0, 128]);
    const image = await rgbaToPdfImage(rgba, 3, 1);
    expect([...(await inflate(image.data))]).toEqual([255, 0, 0, 255, 255, 255, 127, 127, 127]);
  });

  it('encodes titles in any script', () => {
    expect(pdfText('Aअ')).toBe('<FEFF00410905>');
  });

  it('produces a PDF that pdf.js opens, with the right pages, sizes and title', async () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const image = await rgbaToPdfImage(pixels, 4, 4);
    const bytes = buildPdf(
      [
        { widthPt: A4.width, heightPt: A4.height, image },
        { widthPt: 300, heightPt: 200, image },
      ],
      'भौतिकी notes',
    );
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('%PDF-1.4');

    const task = getDocument({ data: bytes });
    const doc = await task.promise;
    expect(doc.numPages).toBe(2);
    const meta = await doc.getMetadata();
    expect((meta.info as { Title?: string }).Title).toBe('भौतिकी notes');
    const first = await doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    expect(Math.round(vp.width)).toBe(595);
    expect(Math.round(vp.height)).toBe(842);
    const ops = await first.getOperatorList();
    expect(ops.fnArray).toContain(OPS.paintImageXObject);
    const second = await doc.getPage(2);
    expect(second.getViewport({ scale: 1 }).width).toBe(300);
    await task.destroy();
  });

  it('refuses an empty document', () => {
    expect(() => buildPdf([])).toThrow();
  });
});
