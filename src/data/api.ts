import type { z } from 'zod';
import { markReachable } from './events';
import { getFirebase } from './firebase';

/** Error from the local AKSHAR server (or a network failure: status 0, code "network"). */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/**
 * Talks to the backend server. Every request carries the X-Akshar header (the
 * server's CSRF check) and the session cookie (sent automatically).
 */
export async function request(
  method: string,
  path: string,
  init: { json?: unknown; body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Response> {
  let res: Response;
  const timeoutSignal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined;
  const signal = init.signal ?? timeoutSignal;
  let uid: string | undefined;
  try {
    uid = getFirebase().auth.currentUser?.uid;
  } catch {
    // Auth not initialized yet
  }
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Akshar': '1',
        ...(uid ? { 'X-Akshar-User': uid } : {}),
        ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : (init.body ?? null),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    markReachable(false);
    throw new ApiError(0, 'network');
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('text/html');

  if (!res.ok) {
    markReachable(false);
    let code = 'server';
    if (!isHtml) {
      try {
        code = ((await res.json()) as { error?: string }).error ?? code;
      } catch {
        // Non-JSON error body.
      }
    }
    throw new ApiError(res.status, code);
  }

  if (isHtml) {
    // When deployed statically (e.g. Vercel), catch-all rewrites may return index.html for API paths.
    // Treat as unreachable server rather than crashing with JSON parse error.
    markReachable(false);
    throw new ApiError(res.status, 'network');
  }

  markReachable(true);
  return res;
}

export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await request('GET', path);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    markReachable(false);
    throw new ApiError(res.status, 'network');
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.warn(`Zod schema mismatch on ${path}:`, parsed.error);
    }
    throw new ApiError(res.status, 'invalid');
  }
  return parsed.data;
}

export async function send(method: string, path: string, json?: unknown): Promise<unknown> {
  const res = await request(method, path, json === undefined ? {} : { json });
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Client-chosen ids (notebooks, pages): random, URL-safe, unguessable. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, 'x');
}

export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
