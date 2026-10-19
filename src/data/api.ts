import type { z } from 'zod';
import { markReachable } from './events';

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
 * Talks to the local server. Every request carries the X-Akshar header (the
 * server's CSRF check) and the HttpOnly session cookie (sent automatically).
 */
export async function request(
  method: string,
  path: string,
  init: { json?: unknown; body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Akshar': '1',
        ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : (init.body ?? null),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    markReachable(false);
    throw new ApiError(0, 'network');
  }
  markReachable(true);
  if (!res.ok) {
    let code = 'server';
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(res.status, code);
  }
  return res;
}

export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await request('GET', path);
  return schema.parse(await res.json());
}

export async function send(method: string, path: string, json?: unknown): Promise<unknown> {
  const res = await request(method, path, json === undefined ? {} : { json });
  return res.status === 204 ? null : ((await res.json()) as unknown);
}

/** Client-chosen ids (notebooks, pages): random, URL-safe, unguessable. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, 'x');
}

export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
