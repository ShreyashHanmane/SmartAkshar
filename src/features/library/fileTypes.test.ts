import { describe, expect, it } from 'vitest';
import { checkBook, sniffBook, titleFromFileName } from './fileTypes';

const enc = (s: string) => new TextEncoder().encode(s);
function epubHead(mimetype = 'application/epub+zip') {
  const name = enc('mimetype');
  const head = new Uint8Array(30 + name.length + mimetype.length);
  head.set([0x50, 0x4b, 0x03, 0x04]);
  head[26] = name.length;
  head.set(name, 30);
  head.set(enc(mimetype), 30 + name.length);
  return head;
}
const limits = { file: 1000, total: 5000, used: 0 };

describe('sniffBook', () => {
  it('recognises PDF, EPUB, and UTF-8 text', () => {
    expect(sniffBook(enc('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffBook(epubHead())).toBe('epub');
    expect(sniffBook(enc('Chapter 1\nनमस्ते दुनिया'))).toBe('txt');
  });

  it('rejects other ZIPs, binaries, and invalid UTF-8', () => {
    expect(sniffBook(epubHead('application/zip'))).toBeNull();
    expect(sniffBook(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0]))).toBeNull();
    expect(sniffBook(new Uint8Array([0xc3, 0x28, 0x41]))).toBeNull();
  });

  it('accepts text whose sample ends mid-character', () => {
    const bytes = enc('abc नमस्ते');
    expect(sniffBook(bytes.subarray(0, bytes.length - 1))).toBe('txt');
  });
});

describe('checkBook', () => {
  it('requires matching extension and content', () => {
    expect(checkBook('a.pdf', enc('%PDF-1.4'), 10, limits)).toEqual({ ok: true, format: 'pdf' });
    expect(checkBook('a.txt', enc('%PDF-1.4'), 10, limits)).toEqual({ ok: false, reason: 'type' });
    expect(checkBook('virus.pdf', enc('MZ\u0090\u0000'), 10, limits)).toEqual({ ok: false, reason: 'type' });
    expect(checkBook('page.html', enc('<html><script>'), 10, limits)).toEqual({ ok: false, reason: 'type' });
  });
  it('enforces per-file and library size limits', () => {
    expect(checkBook('a.pdf', enc('%PDF-1.4'), 2000, limits)).toEqual({ ok: false, reason: 'size' });
    expect(checkBook('a.pdf', enc('%PDF-1.4'), 900, { ...limits, used: 4500 })).toEqual({
      ok: false,
      reason: 'quota',
    });
  });
});

describe('titleFromFileName', () => {
  it('cleans file names', () => {
    expect(titleFromFileName('ch4_newtons-laws.pdf')).toBe('ch4 newtons laws');
    expect(titleFromFileName('.pdf')).toBe('Untitled');
  });
});
