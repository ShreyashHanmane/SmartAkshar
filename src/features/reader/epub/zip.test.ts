import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ZIP_LIMITS, ZipArchive, ZipError, normalizePath, resolveHref } from './zip';

/** Builds a ZIP in memory (stored or deflated entries). */
function makeZip(
  files: { name: string; data: string | Uint8Array; deflate?: boolean; declaredSize?: number }[],
): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const body = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = enc.encode(f.name);
    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, f.deflate ? 8 : 0, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, f.declaredSize ?? raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, f.deflate ? 8 : 0, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, f.declaredSize ?? raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

describe('ZipArchive', () => {
  it('reads stored and deflated entries', async () => {
    const zip = new ZipArchive(
      makeZip([
        { name: 'mimetype', data: 'application/epub+zip' },
        { name: 'OEBPS/ch1.xhtml', data: '<p>नमस्ते — hello</p>'.repeat(50), deflate: true },
      ]),
    );
    expect(await zip.text('mimetype')).toBe('application/epub+zip');
    expect(await zip.text('OEBPS/./ch1.xhtml')).toContain('नमस्ते');
    expect(zip.has('missing')).toBe(false);
  });

  it('stops entries that inflate past their declared size (zip bombs)', async () => {
    const zip = new ZipArchive(
      makeZip([{ name: 'bomb', data: 'a'.repeat(100_000), deflate: true, declaredSize: 10 }]),
    );
    await expect(zip.read('bomb')).rejects.toBeInstanceOf(ZipError);
  });

  it('refuses huge declared sizes before reading', async () => {
    const zip = new ZipArchive(
      makeZip([{ name: 'big', data: 'x', declaredSize: ZIP_LIMITS.entryBytes + 1 }]),
    );
    await expect(zip.read('big')).rejects.toThrow('Entry too large');
  });

  it('rejects non-zip data', () => {
    expect(() => new ZipArchive(new TextEncoder().encode('not a zip'))).toThrow(ZipError);
  });
});

describe('paths', () => {
  it('normalises and resolves relative hrefs', () => {
    expect(normalizePath('OEBPS/./text/../ch1.xhtml')).toBe('OEBPS/ch1.xhtml');
    expect(resolveHref('OEBPS/text/ch1.xhtml', '../images/a%20b.png#x')).toBe('OEBPS/images/a b.png');
    expect(() => normalizePath('../../etc/passwd')).toThrow(ZipError);
  });
});
