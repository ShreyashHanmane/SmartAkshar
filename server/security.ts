import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http.ts';

/** Security headers for every response (CLAUDE.md §7.5). */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function setSecurityHeaders(res: ServerResponse) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}

/**
 * CSRF defence for state-changing requests: the session cookie is
 * SameSite=Strict, and every write must carry the X-Akshar header (which a
 * cross-site form or image can't send) and, when present, a same-origin Origin.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function checkCsrf(req: IncomingMessage) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers['x-akshar'] !== '1') throw new HttpError(403, 'csrf');
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host ?? '';
    if (hostOf(origin) !== host) throw new HttpError(403, 'csrf');
  }
}

/** Fixed-window rate limiter (in memory; the server is local and single-process). */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }
  /** Returns false when `key` is over the limit. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }
  clear(key: string) {
    this.hits.delete(key);
  }
}
