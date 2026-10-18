/**
 * Minimal read-only ZIP reader (enough for EPUB). Uses the browser's
 * DecompressionStream for deflate. Guards against zip bombs and path tricks.
 */
export const ZIP_LIMITS = { entries: 5000, entryBytes: 50 * 1024 * 1024, totalBytes: 200 * 1024 * 1024 };

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export class ZipError extends Error {}

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

export class ZipArchive {
  readonly entries = new Map<string, ZipEntry>();
  private totalRead = 0;

  constructor(private bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // End of central directory: search backwards (comment up to 64 KB).
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (u32(view, i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError('Not a ZIP file');
    const count = u16(view, eocd + 10);
    const cdOffset = u32(view, eocd + 16);
    if (count > ZIP_LIMITS.entries) throw new ZipError('Too many entries');
    let p = cdOffset;
    const decoder = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || u32(view, p) !== 0x02014b50)
        throw new ZipError('Corrupt central directory');
      const flags = u16(view, p + 8);
      const method = u16(view, p + 10);
      const compressedSize = u32(view, p + 20);
      const size = u32(view, p + 24);
      const nameLength = u16(view, p + 28);
      const extraLength = u16(view, p + 30);
      const commentLength = u16(view, p + 32);
      const localOffset = u32(view, p + 42);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
      p += 46 + nameLength + extraLength + commentLength;
      if (flags & 1) throw new ZipError('Encrypted entries are not supported');
      if (name.endsWith('/')) continue;
      this.entries.set(normalizePath(name), { name, method, compressedSize, size, localOffset });
    }
  }

  has(path: string) {
    return this.entries.has(normalizePath(path));
  }

  async read(path: string): Promise<Uint8Array> {
    const entry = this.entries.get(normalizePath(path));
    if (!entry) throw new ZipError(`Missing ${path}`);
    if (entry.size > ZIP_LIMITS.entryBytes) throw new ZipError('Entry too large');
    if ((this.totalRead += entry.size) > ZIP_LIMITS.totalBytes) throw new ZipError('Archive too large');
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const o = entry.localOffset;
    if (o + 30 > this.bytes.length || u32(view, o) !== 0x04034b50) throw new ZipError('Corrupt entry');
    const start = o + 30 + u16(view, o + 26) + u16(view, o + 28);
    const data = this.bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data.slice();
    if (entry.method !== 8) throw new ZipError('Unsupported compression');
    const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      // Never trust the declared size: stop runaway decompression.
      if (length > entry.size || length > ZIP_LIMITS.entryBytes) {
        await reader.cancel();
        throw new ZipError('Entry larger than declared');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  async text(path: string): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }
}

/** Normalises "OEBPS/./text/../a.xhtml" -> "OEBPS/a.xhtml"; rejects escapes above the root. */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) throw new ZipError('Path escapes archive');
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

/** Resolves an href relative to a file inside the archive (drops #fragment and ?query). */
export function resolveHref(fromFile: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]?.split('?')[0] ?? '');
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/') + 1) : '';
  return normalizePath(clean.startsWith('/') ? clean : dir + clean);
}
