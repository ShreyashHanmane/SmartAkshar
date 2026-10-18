/**
 * Minimal ZIP writer (no dependencies) used by the browser (DOCX) and the
 * server (full data export). Entries are either stored or deflated with the
 * web CompressionStream, which both browsers and Node provide. No ZIP64:
 * archives stay far below 4 GB (200 MB of files per user).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function transform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Response(new Blob([data.slice()]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const deflateRaw = (data: Uint8Array) => transform(data, new CompressionStream('deflate-raw'));
export const inflateRaw = (data: Uint8Array) => transform(data, new DecompressionStream('deflate-raw'));

const encoder = new TextEncoder();

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Archive paths: forward slashes, no leading slash, no "..", no control characters. */
export function safeEntryName(name: string): string {
  const parts = name
    .replace(/\\/g, '/')
    .split('/')
    // eslint-disable-next-line no-control-regex -- control characters are not allowed in entry names
    .map((p) => p.replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .filter((p) => p && p !== '.' && p !== '..');
  if (parts.length === 0) throw new Error('Empty ZIP entry name');
  return parts.join('/');
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;

export type ZipSink = (chunk: Uint8Array) => void | Promise<void>;

export class ZipWriter {
  private offset = 0;
  private readonly central: Uint8Array[] = [];
  private count = 0;
  private readonly names = new Set<string>();

  private readonly sink: ZipSink;
  private readonly date: Date;

  constructor(sink: ZipSink, date = new Date()) {
    this.sink = sink;
    this.date = date;
  }

  /** Adds a file. `compress` deflates it (worth it for text, not for PDFs or images). */
  async add(rawName: string, data: Uint8Array, compress = false): Promise<void> {
    const name = safeEntryName(rawName);
    if (this.names.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    this.names.add(name);
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    let body = data;
    let method = 0;
    if (compress) {
      const packed = await deflateRaw(data);
      if (packed.length < data.length) {
        body = packed;
        method = 8;
      }
    }
    const { time, date } = dosDateTime(this.date);

    const local = new Uint8Array(LOCAL_HEADER + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, LOCAL_HEADER);

    const central = new Uint8Array(CENTRAL_HEADER + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, this.offset, true);
    central.set(nameBytes, CENTRAL_HEADER);

    await this.sink(local);
    await this.sink(body);
    this.central.push(central);
    this.offset += local.length + body.length;
    this.count++;
  }

  async finish(): Promise<void> {
    const start = this.offset;
    let size = 0;
    for (const c of this.central) {
      await this.sink(c);
      size += c.length;
    }
    const end = new Uint8Array(END_RECORD);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.count, true);
    ev.setUint16(10, this.count, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, start, true);
    await this.sink(end);
  }
}

/** Builds a whole archive in memory. */
export async function zipFiles(
  files: { name: string; data: Uint8Array | string; compress?: boolean }[],
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter((c) => void chunks.push(c));
  for (const f of files)
    await writer.add(
      f.name,
      typeof f.data === 'string' ? encoder.encode(f.data) : f.data,
      f.compress ?? true,
    );
  await writer.finish();
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Reads a ZIP's entries (stored or deflated). Used by tests to check exports. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - END_RECORD; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Not a ZIP file');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Bad central directory');
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + CENTRAL_HEADER, at + CENTRAL_HEADER + nameLen));
    const dataAt = local + LOCAL_HEADER + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(dataAt, dataAt + packed);
    const data = method === 8 ? await inflateRaw(raw) : raw.slice();
    if (crc32(data) !== crc) throw new Error(`CRC mismatch: ${name}`);
    out.set(name, data);
    at += CENTRAL_HEADER + nameLen + extraLen + commentLen;
  }
  return out;
}
