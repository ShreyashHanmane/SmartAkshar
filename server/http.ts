import { createWriteStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

export function noContent(res: ServerResponse) {
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
}

/** Reads a JSON body up to `limit` bytes and validates it. */
export async function readJson<T>(req: IncomingMessage, schema: z.ZodType<T>, limit = 64 * 1024): Promise<T> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json'))
    throw new HttpError(415, 'json-required');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too-large');
    chunks.push(chunk as Buffer);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad-json');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'invalid');
  return parsed.data;
}

/**
 * Streams a request body to `path`, stopping at `limit` bytes. Returns the size
 * and the first 64 bytes (for magic-byte checks).
 */
export async function streamToFile(
  req: IncomingMessage,
  path: string,
  limit: number,
): Promise<{ size: number; head: Uint8Array }> {
  const declared = Number(req.headers['content-length'] ?? 'NaN');
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, 'too-large');
  const out = createWriteStream(path, { flags: 'wx', mode: 0o600 });
  let size = 0;
  let head = new Uint8Array(0);
  try {
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > limit) throw new HttpError(413, 'too-large');
      if (head.length < 64) head = new Uint8Array(Buffer.concat([head, buf.subarray(0, 64 - head.length)]));
      if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
    }
  } finally {
    await new Promise<void>((resolve) => out.end(resolve));
  }
  return { size, head };
}
