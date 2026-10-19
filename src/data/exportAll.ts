import { request } from './api';

/**
 * Downloads the full data export (ZIP) from the local server, reporting bytes
 * received. Resolves with the file and the name the server suggests.
 */
export async function downloadAllData(
  onBytes: (received: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; name: string }> {
  const res = await request('GET', '/api/export', signal ? { signal } : {});
  const name =
    /filename="([A-Za-z0-9._-]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'akshar-export.zip';
  const reader = res.body?.getReader();
  if (!reader) return { blob: await res.blob(), name };
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(received);
  }
  return { blob: new Blob(chunks, { type: 'application/zip' }), name };
}
