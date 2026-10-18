import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { ZipWriter } from '../src/shared/zip.ts';
import type { Db } from './db.ts';

/**
 * Full data export: one ZIP with data.json (everything the user created, in
 * plain JSON) and their uploaded files. Never includes password hashes,
 * sessions, or anything belonging to another user. Streamed, so memory stays
 * low even for a full 200 MB quota.
 */

const json = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/** Readable, safe file name inside the archive (the archive writer also strips paths). */
function niceName(title: string, id: string, ext: string): string {
  // Strip control characters too: char codes below 32 (and 127) are never valid here.
  const clean = Array.from(title)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${clean || 'book'} (${id.slice(0, 6)}).${ext}`;
}

export function collectUserData(db: Db, uid: string) {
  const all = (sql: string) => db.prepare(sql).all(uid) as Record<string, unknown>[];
  const user = db
    .prepare('SELECT username, display_name, avatar, created_at FROM users WHERE id = ?')
    .get(uid) as {
    username: string;
    display_name: string;
    avatar: string | null;
    created_at: number;
  };
  const settings = db.prepare('SELECT json FROM settings WHERE user_id = ?').get(uid) as
    { json: string } | undefined;
  const pages = all(
    'SELECT notebook_id, idx, elements, updated_at FROM pages WHERE user_id = ? ORDER BY notebook_id, idx',
  );
  const notes = new Map(
    all('SELECT notebook_id, content, updated_at FROM notes WHERE user_id = ?').map((n) => [
      n.notebook_id,
      n,
    ]),
  );
  const highlights = all(
    'SELECT book_id, section, exact, prefix, suffix, created_at FROM highlights WHERE user_id = ? ORDER BY created_at',
  );
  const cards = all(
    'SELECT deck_id, front, back, box, due, reviews, lapses, last_reviewed, created_at FROM cards WHERE user_id = ? ORDER BY created_at',
  );
  const card = (c: Record<string, unknown>) => ({
    front: c.front,
    back: c.back,
    box: c.box,
    due: c.due,
    reviews: c.reviews,
    lapses: c.lapses,
    lastReviewed: c.last_reviewed,
    createdAt: c.created_at,
  });
  const books = all(
    'SELECT id, title, author, format, size, file, page_count, progress, notebook_id, created_at, opened_at FROM books WHERE user_id = ? ORDER BY created_at',
  );

  return {
    data: {
      format: 'akshar-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      account: {
        username: user.username,
        name: user.display_name,
        photo: user.avatar ? `files/images/${user.avatar}` : null,
        createdAt: user.created_at,
      },
      settings: settings ? json(settings.json) : null,
      subjects: all(
        'SELECT id, name, color, created_at FROM subjects WHERE user_id = ? ORDER BY created_at',
      ).map((s) => ({ id: s.id, name: s.name, color: s.color, createdAt: s.created_at })),
      notebooks: all(
        'SELECT id, title, subject_id, mode, paper, background, created_at, updated_at FROM notebooks WHERE user_id = ? ORDER BY created_at',
      ).map((n) => {
        const note = notes.get(n.id);
        return {
          id: n.id,
          title: n.title,
          subjectId: n.subject_id,
          mode: n.mode,
          paper: n.paper,
          background: n.background,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
          pages: pages
            .filter((p) => p.notebook_id === n.id)
            .map((p) => ({ index: p.idx, elements: json(String(p.elements)), updatedAt: p.updated_at })),
          notes: note ? json(String(note.content)) : null,
        };
      }),
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        format: b.format,
        size: b.size,
        file: `files/books/${niceName(String(b.title), String(b.id), String(b.format))}`,
        pageCount: b.page_count,
        progress: b.progress,
        notebookId: b.notebook_id,
        createdAt: b.created_at,
        openedAt: b.opened_at,
        highlights: highlights
          .filter((h) => h.book_id === b.id)
          .map((h) => ({
            section: h.section,
            text: h.exact,
            prefix: h.prefix,
            suffix: h.suffix,
            createdAt: h.created_at,
          })),
      })),
      decks: all(
        'SELECT id, title, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at',
      ).map((d) => ({
        id: d.id,
        title: d.title,
        subjectId: d.subject_id,
        createdAt: d.created_at,
        cards: cards.filter((c) => c.deck_id === d.id).map(card),
      })),
      cardsWithoutDeck: cards.filter((c) => c.deck_id === null).map(card),
      studyTime: all('SELECT day, seconds FROM activity WHERE user_id = ? ORDER BY day').map((a) => ({
        day: a.day,
        seconds: a.seconds,
      })),
    },
    /** Files to include: [path in the archive, path on disk]. */
    files: [
      ...books.map((b) => [
        `files/books/${niceName(String(b.title), String(b.id), String(b.format))}`,
        join('books', String(b.file)),
      ]),
      ...(
        db
          .prepare("SELECT name FROM files WHERE user_id = ? AND kind = 'image' ORDER BY created_at")
          .all(uid) as { name: string }[]
      ).map((f) => [`files/images/${f.name}`, join('images', f.name)]),
    ] as [string, string][],
  };
}

const README = `AKSHAR data export
==================

data.json      Everything you created: account name, settings, subjects,
               notebooks (whiteboard pages and typed notes), books with their
               highlights, flashcard decks and cards, and study time.
files/books    The books you uploaded (PDF, EPUB, TXT).
files/images   Your profile photo and the images used in your typed notes. In data.json, notes refer to
               them as /api/files/images/<name>; the same <name> is used here.

Whiteboard pages store strokes in a fixed page space of 1000 x 1414 units.
Times are milliseconds since 1 January 1970 (UTC).
`;

function write(res: ServerResponse, chunk: Uint8Array): Promise<void> | void {
  if (res.destroyed) throw new Error('client went away');
  if (res.write(chunk)) return;
  return new Promise((resolve, reject) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      if (res.destroyed) reject(new Error('client went away'));
      else resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });
}

export async function streamExport(db: Db, dataDir: string, uid: string, res: ServerResponse): Promise<void> {
  const { data, files } = collectUserData(db, uid);
  const day = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="akshar-export-${day}.zip"`,
    'Cache-Control': 'no-store',
  });
  const zip = new ZipWriter((chunk) => write(res, chunk));
  const missing: string[] = [];
  try {
    for (const [name, rel] of files) {
      let bytes: Uint8Array;
      try {
        bytes = await readFile(join(dataDir, 'files', uid, rel));
      } catch {
        missing.push(name);
        continue;
      }
      await zip.add(name, bytes, false); // PDFs, EPUBs and images are already compressed
    }
    await zip.add('data.json', new TextEncoder().encode(JSON.stringify(data, null, 2)), true);
    const note = missing.length
      ? `\nThese files could not be found on this computer and are not included:\n${missing.map((m) => `  ${m}`).join('\n')}\n`
      : '';
    await zip.add('README.txt', new TextEncoder().encode(README + note), true);
    await zip.finish();
    res.end();
  } catch {
    // The download was cancelled or the disk failed midway; the browser sees an incomplete file.
    res.destroy();
  }
}
