/** Book uploads: PDF, EPUB, TXT. Verified by content and extension (CLAUDE.md §7.4). */
export type BookFormat = 'pdf' | 'epub' | 'txt';

export const BOOK_MIME: Record<BookFormat, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  txt: 'text/plain',
};

/** Strict limits: 25 MB per file for accounts, 5 MB for guests (also in storage.rules). */
export const BOOK_MAX_BYTES = { account: 25 * 1024 * 1024, guest: 5 * 1024 * 1024 } as const;
/** Total library size: 200 MB for accounts, 25 MB for guests (checked before upload). */
export const LIBRARY_MAX_BYTES = { account: 200 * 1024 * 1024, guest: 25 * 1024 * 1024 } as const;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * Detects the format from the first bytes. EPUB: a ZIP whose first entry is the
 * uncompressed "mimetype" file containing application/epub+zip (OCF spec).
 * TXT: valid UTF-8 without NUL bytes.
 */
export function sniffBook(head: Uint8Array): BookFormat | null {
  if (ascii(head, 0, 5) === '%PDF-') return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    const nameLength = (head[26] ?? 0) | ((head[27] ?? 0) << 8);
    const extraLength = (head[28] ?? 0) | ((head[29] ?? 0) << 8);
    if (
      ascii(head, 30, nameLength) === 'mimetype' &&
      ascii(head, 30 + nameLength + extraLength, 20) === 'application/epub+zip'
    )
      return 'epub';
    return null;
  }
  if (head.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(trimPartialUtf8(head));
    return 'txt';
  } catch {
    return null;
  }
}

/** Drops an incomplete multi-byte character at the end of a sampled prefix. */
function trimPartialUtf8(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = bytes[end - i] ?? 0;
    if ((b & 0xc0) === 0x80) continue;
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    if (need > i) end -= i;
    break;
  }
  return bytes.subarray(0, end);
}

export type BookCheck = { ok: true; format: BookFormat } | { ok: false; reason: 'type' | 'size' | 'quota' };

export function checkBook(
  name: string,
  head: Uint8Array,
  size: number,
  limits: { file: number; total: number; used: number },
): BookCheck {
  const format = sniffBook(head);
  const ext = name.toLowerCase().split('.').pop();
  if (!format || ext !== format) return { ok: false, reason: 'type' };
  if (size === 0 || size > limits.file) return { ok: false, reason: 'size' };
  if (limits.used + size > limits.total) return { ok: false, reason: 'quota' };
  return { ok: true, format };
}

/** A readable default title from a file name ("ch4_newtons-laws.pdf" -> "ch4 newtons laws"). */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (base || 'Untitled').slice(0, 200);
}
