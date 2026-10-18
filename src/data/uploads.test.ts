import { describe, expect, it } from 'vitest';
import { checkImage, randomName, sniffImage } from './uploads';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const svg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

describe('image uploads', () => {
  it('detects formats from bytes', () => {
    expect(sniffImage(png)).toBe('png');
    expect(sniffImage(jpeg)).toBe('jpeg');
    expect(sniffImage(webp)).toBe('webp');
    expect(sniffImage(svg)).toBeNull();
  });

  it('requires content and extension to agree, and enforces size', () => {
    expect(checkImage('a.png', png, 100, 1000)).toEqual({ ok: true, kind: 'png' });
    expect(checkImage('a.JPG', jpeg, 100, 1000)).toEqual({ ok: true, kind: 'jpeg' });
    expect(checkImage('a.png', jpeg, 100, 1000)).toEqual({ ok: false, reason: 'type' });
    expect(checkImage('evil.svg', svg, 100, 1000)).toEqual({ ok: false, reason: 'type' });
    expect(checkImage('renamed.png', svg, 100, 1000)).toEqual({ ok: false, reason: 'type' });
    expect(checkImage('a.png', png, 5000, 1000)).toEqual({ ok: false, reason: 'size' });
  });

  it('generates random names', () => {
    expect(randomName('png')).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(randomName('png')).not.toBe(randomName('png'));
  });
});
