import { mkdirSync, rmSync, statSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { cleanContent } from '../src/shared/clean.ts';
import {
  BOOK_MAX_BYTES,
  BOOK_MIME,
  USER_FILES_MAX_BYTES,
  sniffBook,
  type BookFormat,
} from '../src/shared/fileTypes.ts';
import { IMAGE_EXT, IMAGE_MIME, NOTE_IMAGE_MAX_BYTES, sniffImage } from '../src/shared/images.ts';
import {
  DAY,
  DEFAULT_SETTINGS,
  LIMITS,
  PAGE_MAX_BYTES,
  activityInputSchema,
  bookPatchSchema,
  highlightInputSchema,
  loginSchema,
  notebookCreateSchema,
  notebookPatchSchema,
  pageInputSchema,
  passwordSchema,
  replacePagesSchema,
  settingsPatchSchema,
  settingsSchema,
  signUpSchema,
  subjectInputSchema,
} from '../src/shared/schemas.ts';
import {
  createSession,
  dummyPasswordHash,
  endSession,
  hashPassword,
  newId,
  requireUser,
  sessionUser,
  verifyPassword,
} from './auth.ts';
import { type Db, tx } from './db.ts';
import type { EventHub } from './events.ts';
import { HttpError, noContent, readJson, sendJson, streamToFile } from './http.ts';
import { RateLimiter } from './security.ts';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  db: Db;
  hub: EventHub;
  dataDir: string;
  params: Record<string, string>;
  query: URLSearchParams;
  secure: boolean;
}

type Handler = (ctx: Ctx) => Promise<void> | void;
interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler) {
  const pattern = new RegExp(
    `^${path.replace(/:(\w+)/g, (_, name: string) => `(?<${name}>[A-Za-z0-9_-]{1,40})`)}$`,
  );
  routes.push({ method, pattern, handler });
}

export function match(method: string, path: string) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (m) return { handler: r.handler, params: { ...(m.groups ?? {}) } };
  }
  return null;
}

const loginLimiter = new RateLimiter(10, 15 * 60_000);
const ipLimiter = new RateLimiter(60, 15 * 60_000);
const now = () => Date.now();
const userDir = (ctx: Ctx, uid: string, kind: 'images' | 'books') => join(ctx.dataDir, 'files', uid, kind);
const usedBytes = (db: Db, uid: string) =>
  Number(
    (db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE user_id = ?').get(uid) as { n: number })
      .n,
  );

function userView(db: Db, uid: string) {
  const row = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(uid) as
    { id: string; username: string; display_name: string } | undefined;
  if (!row) throw new HttpError(401, 'unauthenticated');
  return { id: row.id, username: row.username, displayName: row.display_name };
}

// --- accounts ----------------------------------------------------------------

route('GET', '/api/auth/me', (ctx) => {
  const uid = sessionUser(ctx.db, ctx.req);
  sendJson(ctx.res, 200, { user: uid ? userView(ctx.db, uid) : null });
});

route('POST', '/api/auth/signup', async (ctx) => {
  const body = await readJson(ctx.req, signUpSchema);
  const exists = ctx.db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username);
  if (exists) throw new HttpError(409, 'username-taken');
  const id = newId();
  const hash = await hashPassword(body.password);
  ctx.db
    .prepare(
      'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, body.username, body.name, hash, now());
  createSession(ctx.db, id, ctx.res, ctx.secure);
  sendJson(ctx.res, 201, { user: userView(ctx.db, id) });
});

route('POST', '/api/auth/login', async (ctx) => {
  const body = await readJson(ctx.req, loginSchema);
  const ip = ctx.req.socket.remoteAddress ?? '';
  const key = `${body.username.toLowerCase()}|${ip}`;
  if (!loginLimiter.take(key) || !ipLimiter.take(`login:${ip}`)) throw new HttpError(429, 'rate-limited');
  const row = ctx.db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(body.username) as
    { id: string; password_hash: string } | undefined;
  // Same work for unknown usernames, so timing doesn't reveal which accounts exist.
  const ok = await verifyPassword(body.password, row?.password_hash ?? (await dummyPasswordHash()));
  if (!row || !ok) throw new HttpError(401, 'invalid-credentials');
  loginLimiter.clear(key);
  createSession(ctx.db, row.id, ctx.res, ctx.secure);
  sendJson(ctx.res, 200, { user: userView(ctx.db, row.id) });
});

route('POST', '/api/auth/logout', (ctx) => {
  endSession(ctx.db, ctx.req, ctx.res, ctx.secure);
  noContent(ctx.res);
});

route('POST', '/api/auth/password', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(
    ctx.req,
    z.object({ current: z.string().max(128), next: passwordSchema }).strict(),
  );
  if (!loginLimiter.take(`password|${uid}`)) throw new HttpError(429, 'rate-limited');
  const row = ctx.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(uid) as {
    password_hash: string;
  };
  if (!(await verifyPassword(body.current, row.password_hash)))
    throw new HttpError(401, 'invalid-credentials');
  ctx.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(body.next), uid);
  // Sign out every other session; keep this one.
  ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
  createSession(ctx.db, uid, ctx.res, ctx.secure);
  noContent(ctx.res);
});

route('PATCH', '/api/account', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(
    ctx.req,
    z.object({ displayName: z.string().trim().min(1).max(LIMITS.name) }).strict(),
  );
  ctx.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.displayName, uid);
  ctx.hub.publish(uid, 'account');
  sendJson(ctx.res, 200, { user: userView(ctx.db, uid) });
});

/** Deletes the account, all its data, and its files. Requires the password. */
route('POST', '/api/account/delete', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, z.object({ password: z.string().max(128) }).strict());
  const row = ctx.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(uid) as {
    password_hash: string;
  };
  if (!(await verifyPassword(body.password, row.password_hash)))
    throw new HttpError(401, 'invalid-credentials');
  ctx.db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  rmSync(join(ctx.dataDir, 'files', uid), { recursive: true, force: true });
  ctx.hub.closeAll(uid);
  endSession(ctx.db, ctx.req, ctx.res, ctx.secure);
  noContent(ctx.res);
});

// --- settings ----------------------------------------------------------------

function readSettings(db: Db, uid: string) {
  const row = db.prepare('SELECT json FROM settings WHERE user_id = ?').get(uid) as
    { json: string } | undefined;
  return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.json) as object) : {}) });
}

route('GET', '/api/settings', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  sendJson(ctx.res, 200, readSettings(ctx.db, uid));
});

route('PATCH', '/api/settings', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const patch = await readJson(ctx.req, settingsPatchSchema);
  const next = { ...readSettings(ctx.db, uid), ...patch };
  ctx.db
    .prepare(
      'INSERT INTO settings (user_id, json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json',
    )
    .run(uid, JSON.stringify(next));
  ctx.hub.publish(uid, 'settings');
  sendJson(ctx.res, 200, next);
});

// --- subjects ----------------------------------------------------------------

route('GET', '/api/subjects', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const rows = ctx.db
    .prepare('SELECT id, name, color FROM subjects WHERE user_id = ? ORDER BY created_at')
    .all(uid);
  sendJson(ctx.res, 200, rows);
});

route('POST', '/api/subjects', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, subjectInputSchema);
  const count = (
    ctx.db.prepare('SELECT COUNT(*) AS n FROM subjects WHERE user_id = ?').get(uid) as { n: number }
  ).n;
  if (count >= 200) throw new HttpError(409, 'limit');
  const id = newId();
  ctx.db
    .prepare(
      'INSERT INTO subjects (user_id, id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(uid, id, body.name, body.color, now(), now());
  ctx.hub.publish(uid, 'subjects');
  sendJson(ctx.res, 201, { id });
});

route('PATCH', '/api/subjects/:id', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, subjectInputSchema.partial());
  const result = ctx.db
    .prepare(
      'UPDATE subjects SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = ? WHERE user_id = ? AND id = ?',
    )
    .run(body.name ?? null, body.color ?? null, now(), uid, ctx.params.id ?? '');
  if (result.changes === 0) throw new HttpError(404, 'not-found');
  ctx.hub.publish(uid, 'subjects');
  noContent(ctx.res);
});

route('DELETE', '/api/subjects/:id', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  tx(ctx.db, () => {
    // Notebooks in the subject are kept and become "No subject".
    ctx.db
      .prepare('UPDATE notebooks SET subject_id = NULL WHERE user_id = ? AND subject_id = ?')
      .run(uid, id);
    ctx.db.prepare('DELETE FROM subjects WHERE user_id = ? AND id = ?').run(uid, id);
  });
  ctx.hub.publish(uid, 'subjects', 'notebooks');
  noContent(ctx.res);
});

// --- notebooks, pages, notes ------------------------------------------------

const notebookCols =
  'id, title, subject_id AS subjectId, mode, paper, background, page_count AS pageCount, updated_at AS updatedAt';

function requireNotebook(db: Db, uid: string, id: string) {
  const row = db.prepare(`SELECT ${notebookCols} FROM notebooks WHERE user_id = ? AND id = ?`).get(uid, id);
  if (!row) throw new HttpError(404, 'not-found');
  return row;
}

function touchNotebook(db: Db, uid: string, id: string) {
  const count = (
    db.prepare('SELECT COUNT(*) AS n FROM pages WHERE user_id = ? AND notebook_id = ?').get(uid, id) as {
      n: number;
    }
  ).n;
  db.prepare('UPDATE notebooks SET updated_at = ?, page_count = MAX(1, ?) WHERE user_id = ? AND id = ?').run(
    now(),
    count,
    uid,
    id,
  );
}

route('GET', '/api/notebooks', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const rows = ctx.db
    .prepare(`SELECT ${notebookCols} FROM notebooks WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500`)
    .all(uid);
  sendJson(ctx.res, 200, rows);
});

route('GET', '/api/notebooks/:id', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  sendJson(ctx.res, 200, requireNotebook(ctx.db, uid, ctx.params.id ?? ''));
});

/** Creates a notebook (client-chosen id) with its first empty page. */
route('PUT', '/api/notebooks/:id', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, notebookCreateSchema);
  const id = ctx.params.id ?? '';
  tx(ctx.db, () => {
    if (ctx.db.prepare('SELECT 1 FROM notebooks WHERE user_id = ? AND id = ?').get(uid, id))
      throw new HttpError(409, 'exists');
    ctx.db
      .prepare(
        'INSERT INTO notebooks (user_id, id, title, subject_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(uid, id, body.title, body.subjectId, now(), now());
    ctx.db
      .prepare(
        "INSERT INTO pages (user_id, notebook_id, id, idx, elements, updated_at) VALUES (?, ?, 'p0', 0, '[]', ?)",
      )
      .run(uid, id, now());
  });
  ctx.hub.publish(uid, 'notebooks', `notebook:${id}`);
  sendJson(ctx.res, 201, { id });
});

route('PATCH', '/api/notebooks/:id', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, notebookPatchSchema);
  const id = ctx.params.id ?? '';
  requireNotebook(ctx.db, uid, id);
  const sets: string[] = [];
  const values: (string | null)[] = [];
  const cols: Record<string, string> = {
    title: 'title',
    subjectId: 'subject_id',
    paper: 'paper',
    background: 'background',
  };
  for (const [key, col] of Object.entries(cols)) {
    if (key in body) {
      sets.push(`${col} = ?`);
      values.push((body as Record<string, string | null>)[key] ?? null);
    }
  }
  if (sets.length)
    ctx.db
      .prepare(`UPDATE notebooks SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ? AND id = ?`)
      .run(...values, now(), uid, id);
  ctx.hub.publish(uid, 'notebooks', `notebook:${id}`);
  noContent(ctx.res);
});

route('DELETE', '/api/notebooks/:id', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const images = ctx.db
    .prepare("SELECT name FROM files WHERE user_id = ? AND kind = 'image' AND owner_ref = ?")
    .all(uid, id) as {
    name: string;
  }[];
  tx(ctx.db, () => {
    for (const table of ['pages', 'notes'])
      ctx.db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND notebook_id = ?`).run(uid, id);
    ctx.db.prepare("DELETE FROM files WHERE user_id = ? AND kind = 'image' AND owner_ref = ?").run(uid, id);
    ctx.db.prepare('UPDATE books SET notebook_id = NULL WHERE user_id = ? AND notebook_id = ?').run(uid, id);
    ctx.db.prepare('DELETE FROM notebooks WHERE user_id = ? AND id = ?').run(uid, id);
  });
  await Promise.all(images.map((f) => rm(join(userDir(ctx, uid, 'images'), f.name), { force: true })));
  ctx.hub.publish(uid, 'notebooks', `notebook:${id}`, 'books');
  noContent(ctx.res);
});

route('GET', '/api/notebooks/:id/pages', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  requireNotebook(ctx.db, uid, id);
  const first = ctx.query.get('first') === '1';
  const rows = ctx.db
    .prepare(
      `SELECT id, idx AS "index", elements FROM pages WHERE user_id = ? AND notebook_id = ? ORDER BY idx${first ? ' LIMIT 1' : ''}`,
    )
    .all(uid, id) as { id: string; index: number; elements: string }[];
  sendJson(
    ctx.res,
    200,
    rows.map((r) => ({ id: r.id, index: r.index, elements: JSON.parse(r.elements) as unknown })),
  );
});

/** Saves one whole page (last write wins per page). Creates it if new. */
route('PUT', '/api/notebooks/:id/pages/:pageId', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const body = await readJson(ctx.req, pageInputSchema, 2 * 1024 * 1024);
  const json = JSON.stringify(body.elements);
  if (Buffer.byteLength(json) > PAGE_MAX_BYTES) throw new HttpError(413, 'page-full');
  tx(ctx.db, () => {
    requireNotebook(ctx.db, uid, id);
    ctx.db
      .prepare(
        `INSERT INTO pages (user_id, notebook_id, id, idx, elements, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, notebook_id, id) DO UPDATE SET idx = excluded.idx, elements = excluded.elements, updated_at = excluded.updated_at`,
      )
      .run(uid, id, ctx.params.pageId ?? '', body.index, json, now());
    touchNotebook(ctx.db, uid, id);
  });
  ctx.hub.publish(uid, `pages:${id}`, 'notebooks');
  noContent(ctx.res);
});

/** Replaces every page at once (Paged <-> Infinite switch), atomically. */
route('POST', '/api/notebooks/:id/replace', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const body = await readJson(ctx.req, replacePagesSchema, 8 * 1024 * 1024);
  const pages = body.pages.map((els) => JSON.stringify(els));
  if (pages.some((p) => Buffer.byteLength(p) > PAGE_MAX_BYTES)) throw new HttpError(413, 'page-full');
  tx(ctx.db, () => {
    requireNotebook(ctx.db, uid, id);
    ctx.db.prepare('DELETE FROM pages WHERE user_id = ? AND notebook_id = ?').run(uid, id);
    const insert = ctx.db.prepare(
      'INSERT INTO pages (user_id, notebook_id, id, idx, elements, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    pages.forEach((json, i) => insert.run(uid, id, i === 0 ? 'p0' : newId(), i, json, now()));
    ctx.db
      .prepare('UPDATE notebooks SET mode = ?, page_count = ?, updated_at = ? WHERE user_id = ? AND id = ?')
      .run(body.mode, pages.length, now(), uid, id);
  });
  ctx.hub.publish(uid, `pages:${id}`, 'notebooks', `notebook:${id}`);
  noContent(ctx.res);
});

route('GET', '/api/notebooks/:id/note', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  requireNotebook(ctx.db, uid, id);
  const row = ctx.db
    .prepare('SELECT content FROM notes WHERE user_id = ? AND notebook_id = ?')
    .get(uid, id) as { content: string } | undefined;
  sendJson(ctx.res, 200, { content: row ? (JSON.parse(row.content) as unknown) : null });
});

route('PUT', '/api/notebooks/:id/note', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const body = await readJson(
    ctx.req,
    z.object({ content: z.record(z.string(), z.unknown()) }).strict(),
    2 * 1024 * 1024,
  );
  // The server cleans notes too: never trust the browser to have done it.
  const json = JSON.stringify(cleanContent(body.content));
  if (Buffer.byteLength(json) > PAGE_MAX_BYTES) throw new HttpError(413, 'note-too-large');
  requireNotebook(ctx.db, uid, id);
  ctx.db
    .prepare(
      `INSERT INTO notes (user_id, notebook_id, content, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, notebook_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    .run(uid, id, json, now());
  ctx.db.prepare('UPDATE notebooks SET updated_at = ? WHERE user_id = ? AND id = ?').run(now(), uid, id);
  ctx.hub.publish(uid, `note:${id}`, 'notebooks');
  noContent(ctx.res);
});

// --- uploaded files ----------------------------------------------------------

async function receiveFile(ctx: Ctx, uid: string, kind: 'images' | 'books', limit: number) {
  const remaining = USER_FILES_MAX_BYTES - usedBytes(ctx.db, uid);
  if (remaining <= 0) throw new HttpError(413, 'quota');
  const dir = userDir(ctx, uid, kind);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.upload-${randomBytes(8).toString('hex')}`);
  try {
    const { size, head } = await streamToFile(ctx.req, tmp, Math.min(limit, remaining));
    return { tmp, size, head };
  } catch (error) {
    await rm(tmp, { force: true });
    if (error instanceof HttpError && error.code === 'too-large' && remaining < limit)
      throw new HttpError(413, 'quota');
    throw error;
  }
}

function fileName(ctx: Ctx): string {
  const raw = ctx.req.headers['x-file-name'];
  const name = typeof raw === 'string' ? decodeURIComponent(raw).slice(0, 255) : '';
  if (!name) throw new HttpError(400, 'file-name-required');
  return name;
}

route('POST', '/api/notebooks/:id/images', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  requireNotebook(ctx.db, uid, id);
  const ext = fileName(ctx).toLowerCase().split('.').pop() ?? '';
  const { tmp, size, head } = await receiveFile(ctx, uid, 'images', NOTE_IMAGE_MAX_BYTES);
  const kind = sniffImage(head);
  if (!kind || ![IMAGE_EXT[kind], kind].includes(ext) || size === 0) {
    await rm(tmp, { force: true });
    throw new HttpError(415, 'type');
  }
  const name = `${randomBytes(16).toString('hex')}.${IMAGE_EXT[kind]}`;
  await rename(tmp, join(userDir(ctx, uid, 'images'), name));
  ctx.db
    .prepare(
      "INSERT INTO files (user_id, name, kind, size, owner_ref, created_at) VALUES (?, ?, 'image', ?, ?, ?)",
    )
    .run(uid, name, size, id, now());
  sendJson(ctx.res, 201, { url: `/api/files/images/${name}` });
});

const FILE_NAME = /^[0-9a-f]{32}\.(png|jpg|gif|webp|pdf|epub|txt)$/;

function serveFile(ctx: Ctx, uid: string, kind: 'images' | 'books', name: string, type: string) {
  const path = join(userDir(ctx, uid, kind), name);
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new HttpError(404, 'not-found');
  }
  ctx.res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Cache-Control': 'private, max-age=31536000, immutable',
    // Never render user files as a page in this origin.
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': kind === 'books' ? 'attachment' : 'inline',
  });
  createReadStream(path).pipe(ctx.res);
}

export function matchFile(path: string) {
  const m = /^\/api\/files\/images\/([0-9a-f]{32}\.(png|jpg|gif|webp))$/.exec(path);
  return m?.[1] ?? null;
}

export function serveImage(ctx: Ctx, name: string) {
  const uid = requireUser(ctx.db, ctx.req);
  if (!FILE_NAME.test(name)) throw new HttpError(404, 'not-found');
  // Only the owner's files are reachable (the row must exist under this user).
  const row = ctx.db
    .prepare("SELECT 1 FROM files WHERE user_id = ? AND kind = 'image' AND name = ?")
    .get(uid, name);
  if (!row) throw new HttpError(404, 'not-found');
  const ext = name.split('.').pop() as string;
  const kind =
    (Object.keys(IMAGE_EXT) as (keyof typeof IMAGE_EXT)[]).find((k) => IMAGE_EXT[k] === ext) ?? 'png';
  serveFile(ctx, uid, 'images', name, IMAGE_MIME[kind]);
}

// --- activity, cards, search -------------------------------------------------

route('GET', '/api/activity', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const from = ctx.query.get('from') ?? '0000-00-00';
  if (!DAY.test(from) && from !== '0000-00-00') throw new HttpError(400, 'invalid');
  const rows = ctx.db
    .prepare('SELECT day, seconds FROM activity WHERE user_id = ? AND day >= ? ORDER BY day')
    .all(uid, from) as {
    day: string;
    seconds: number;
  }[];
  sendJson(ctx.res, 200, Object.fromEntries(rows.map((r) => [r.day, r.seconds])));
});

route('POST', '/api/activity', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, activityInputSchema);
  ctx.db
    .prepare(
      `INSERT INTO activity (user_id, day, seconds) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET seconds = MIN(86400, seconds + excluded.seconds)`,
    )
    .run(uid, body.day, body.seconds);
  ctx.hub.publish(uid, 'activity');
  noContent(ctx.res);
});

route('GET', '/api/cards/due-count', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const before = Number(ctx.query.get('before') ?? now());
  if (!Number.isFinite(before)) throw new HttpError(400, 'invalid');
  const n = (
    ctx.db.prepare('SELECT COUNT(*) AS n FROM cards WHERE user_id = ? AND due <= ?').get(uid, before) as {
      n: number;
    }
  ).n;
  sendJson(ctx.res, 200, { count: n });
});

route('GET', '/api/search-index', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const subjects = ctx.db.prepare('SELECT id, name FROM subjects WHERE user_id = ?').all(uid);
  const notebooks = ctx.db
    .prepare('SELECT id, title, subject_id AS subjectId FROM notebooks WHERE user_id = ? LIMIT 1000')
    .all(uid);
  const books = ctx.db.prepare('SELECT id, title, author FROM books WHERE user_id = ? LIMIT 1000').all(uid);
  sendJson(ctx.res, 200, { subjects, notebooks, books, decks: [] });
});

// --- books -------------------------------------------------------------------

const bookCols = `id, title, author, format, size, page_count AS pageCount, progress, position, notebook_id AS notebookId,
  opened_at AS openedAt`;
const bookRow = (r: Record<string, unknown>) => ({
  ...r,
  position: JSON.parse(String(r.position)) as unknown,
});

function requireBook(db: Db, uid: string, id: string) {
  const row = db.prepare(`SELECT ${bookCols}, file FROM books WHERE user_id = ? AND id = ?`).get(uid, id) as
    (Record<string, unknown> & { file: string; format: BookFormat }) | undefined;
  if (!row) throw new HttpError(404, 'not-found');
  return row;
}

route('GET', '/api/books', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const limit = Math.min(500, Math.max(1, Number(ctx.query.get('limit') ?? 500) || 500));
  const rows = ctx.db
    .prepare(`SELECT ${bookCols} FROM books WHERE user_id = ? ORDER BY opened_at DESC LIMIT ?`)
    .all(uid, limit);
  sendJson(ctx.res, 200, (rows as Record<string, unknown>[]).map(bookRow));
});

route('GET', '/api/books/:id', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const { file: _file, ...book } = requireBook(ctx.db, uid, ctx.params.id ?? '');
  sendJson(ctx.res, 200, bookRow(book));
});

/** Upload: raw file body; X-File-Name, X-Title, X-Author, X-Page-Count headers. */
route('POST', '/api/books', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const name = fileName(ctx);
  const header = (h: string) => {
    const v = ctx.req.headers[h];
    return typeof v === 'string' ? decodeURIComponent(v).trim() : '';
  };
  const title =
    header('x-title').slice(0, LIMITS.bookTitle) ||
    name.replace(/\.[^.]+$/, '').slice(0, LIMITS.bookTitle) ||
    'Untitled';
  const author = header('x-author').slice(0, 200) || null;
  const pageCount = Math.max(0, Math.min(100_000, Number(header('x-page-count')) || 0));
  const { tmp, size, head } = await receiveFile(ctx, uid, 'books', BOOK_MAX_BYTES);
  const format = sniffBook(head);
  if (!format || name.toLowerCase().split('.').pop() !== format || size === 0) {
    await rm(tmp, { force: true });
    throw new HttpError(415, 'type');
  }
  const file = `${randomBytes(16).toString('hex')}.${format}`;
  await rename(tmp, join(userDir(ctx, uid, 'books'), file));
  const id = newId();
  tx(ctx.db, () => {
    ctx.db
      .prepare(
        "INSERT INTO files (user_id, name, kind, size, owner_ref, created_at) VALUES (?, ?, 'book', ?, ?, ?)",
      )
      .run(uid, file, size, id, now());
    ctx.db
      .prepare(
        `INSERT INTO books (user_id, id, title, author, format, size, file, page_count, created_at, opened_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(uid, id, title, author, format, size, file, pageCount, now(), now(), now());
  });
  ctx.hub.publish(uid, 'books');
  sendJson(ctx.res, 201, { id });
});

route('PATCH', '/api/books/:id', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const body = await readJson(ctx.req, bookPatchSchema);
  requireBook(ctx.db, uid, id);
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now()];
  const add = (sql: string, value: string | number | null) => {
    sets.push(sql);
    values.push(value);
  };
  if (body.title !== undefined) add('title = ?', body.title);
  if (body.progress !== undefined) add('progress = ?', body.progress);
  if (body.position !== undefined) add('position = ?', JSON.stringify(body.position));
  if (body.pageCount !== undefined) add('page_count = ?', body.pageCount);
  if (body.notebookId !== undefined) add('notebook_id = ?', body.notebookId);
  if (body.opened) add('opened_at = ?', now());
  ctx.db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`).run(...values, uid, id);
  ctx.hub.publish(uid, 'books', `book:${id}`);
  noContent(ctx.res);
});

route('DELETE', '/api/books/:id', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const book = requireBook(ctx.db, uid, id);
  tx(ctx.db, () => {
    ctx.db.prepare('DELETE FROM highlights WHERE user_id = ? AND book_id = ?').run(uid, id);
    ctx.db.prepare('DELETE FROM files WHERE user_id = ? AND name = ?').run(uid, book.file);
    ctx.db.prepare('DELETE FROM books WHERE user_id = ? AND id = ?').run(uid, id);
  });
  await rm(join(userDir(ctx, uid, 'books'), book.file), { force: true });
  ctx.hub.publish(uid, 'books', `book:${id}`);
  noContent(ctx.res);
});

route('GET', '/api/books/:id/file', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const book = requireBook(ctx.db, uid, ctx.params.id ?? '');
  serveFile(ctx, uid, 'books', book.file, BOOK_MIME[book.format]);
});

route('GET', '/api/books/:id/highlights', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  requireBook(ctx.db, uid, id);
  sendJson(
    ctx.res,
    200,
    ctx.db
      .prepare(
        'SELECT id, section, exact, prefix, suffix FROM highlights WHERE user_id = ? AND book_id = ? ORDER BY created_at',
      )
      .all(uid, id),
  );
});

route('POST', '/api/books/:id/highlights', async (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  const body = await readJson(ctx.req, highlightInputSchema);
  requireBook(ctx.db, uid, id);
  const hid = newId();
  ctx.db
    .prepare(
      'INSERT INTO highlights (user_id, book_id, id, section, exact, prefix, suffix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(uid, id, hid, body.section, body.exact, body.prefix, body.suffix, now());
  ctx.hub.publish(uid, `highlights:${id}`);
  sendJson(ctx.res, 201, { id: hid });
});

route('DELETE', '/api/books/:id/highlights/:hid', (ctx) => {
  const uid = requireUser(ctx.db, ctx.req);
  const id = ctx.params.id ?? '';
  ctx.db
    .prepare('DELETE FROM highlights WHERE user_id = ? AND book_id = ? AND id = ?')
    .run(uid, id, ctx.params.hid ?? '');
  ctx.hub.publish(uid, `highlights:${id}`);
  noContent(ctx.res);
});

// --- live updates --------------------------------------------------------------

/**
 * Live updates. Signed-out pages connect too (with no topics): the open stream
 * is how the app knows the local server is reachable.
 */
route('GET', '/api/events', (ctx) => {
  ctx.hub.add(sessionUser(ctx.db, ctx.req) ?? '', ctx.res);
});
