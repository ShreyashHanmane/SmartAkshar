import { describe, expect, it } from 'vitest';
import { crc32, safeEntryName, unzip, zipFiles } from './zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('round-trips stored and deflated entries, including UTF-8 names', async () => {
    const big = 'Newton '.repeat(2000);
    const zip = await zipFiles([
      { name: 'notes/मराठी.txt', data: 'नमस्ते' },
      { name: 'big.txt', data: big },
      { name: 'raw.bin', data: new Uint8Array([0, 1, 2, 255]), compress: false },
    ]);
    expect(zip.length).toBeLessThan(big.length); // deflate did its job
    const files = await unzip(zip);
    expect(new TextDecoder().decode(files.get('notes/मराठी.txt'))).toBe('नमस्ते');
    expect(new TextDecoder().decode(files.get('big.txt'))).toBe(big);
    expect([...(files.get('raw.bin') ?? [])]).toEqual([0, 1, 2, 255]);
  });

  it('keeps entry names inside the archive', () => {
    expect(safeEntryName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeEntryName('/abs\\win\\path')).toBe('abs/win/path');
    expect(safeEntryName('a/./b\u0000c')).toBe('a/bc');
    expect(() => safeEntryName('../..')).toThrow();
  });

  it('rejects duplicate names', async () => {
    await expect(
      zipFiles([
        { name: 'a.txt', data: '1' },
        { name: './a.txt', data: '2' },
      ]),
    ).rejects.toThrow(/Duplicate/);
  });
});
