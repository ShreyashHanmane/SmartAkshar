/** Image validation shared by the browser (early feedback) and the server (enforcement). */
export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';

export const IMAGE_MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const IMAGE_EXT: Record<ImageKind, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };

/** Note images: up to 5 MB each. */
export const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg';
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return 'gif';
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return 'webp';
  return null;
}

const EXTENSIONS: Record<ImageKind, string[]> = {
  png: ['png'],
  jpeg: ['jpg', 'jpeg'],
  gif: ['gif'],
  webp: ['webp'],
};

export type ImageCheck = { ok: true; kind: ImageKind } | { ok: false; reason: 'type' | 'size' };

/** Content and extension must agree, and the file must fit the size limit. */
export function checkImage(name: string, bytes: Uint8Array, size: number, maxBytes: number): ImageCheck {
  const kind = sniffImage(bytes);
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (!kind || !EXTENSIONS[kind].includes(ext)) return { ok: false, reason: 'type' };
  if (size > maxBytes || size === 0) return { ok: false, reason: 'size' };
  return { ok: true, kind };
}
