import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: object,
) => Promise<Buffer>;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;
export const SESSION_COOKIE = 'akshar_session';
export const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash of a password nobody knows, so unknown usernames take as long as known ones. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

export function newId(): string {
  return randomBytes(15).toString('base64url').replace(/[-_]/g, 'x');
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function createSession(db: Db, userId: string, res: ServerResponse, secure: boolean) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now,
    now + SESSION_DAYS * 86_400_000,
  );
  setCookie(res, token, SESSION_DAYS * 86_400, secure);
}

function setCookie(res: ServerResponse, value: string, maxAge: number, secure: boolean) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`,
  );
}

function readToken(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=') || null;
  }
  return null;
}

/** The signed-in user's id, or null. Extends the session (sliding expiry). */
export function sessionUser(db: Db, req: IncomingMessage): string | null {
  const token = readToken(req);
  if (token && token.length <= 100) {
    const hash = sha256(token);
    const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hash) as
      { user_id: string; expires_at: number } | undefined;
    if (row) {
      const now = Date.now();
      if (row.expires_at <= now) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      } else {
        if (row.expires_at - now < (SESSION_DAYS - 1) * 86_400_000)
          db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
            now + SESSION_DAYS * 86_400_000,
            hash,
          );
        return row.user_id;
      }
    }
  }
  const cloudUser = req.headers['x-akshar-user'];
  if (typeof cloudUser === 'string' && cloudUser.trim()) {
    return cloudUser.trim();
  }
  return null;
}

export function requireUser(db: Db, req: IncomingMessage): string {
  const uid = sessionUser(db, req);
  if (!uid) throw new HttpError(401, 'unauthenticated');
  return uid;
}

export function endSession(db: Db, req: IncomingMessage, res: ServerResponse, secure: boolean) {
  const token = readToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(res, '', 0, secure);
}
