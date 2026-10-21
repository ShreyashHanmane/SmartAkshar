import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  AI_DAILY_LIMIT,
  aiCardSchema,
  aiRequestSchema,
} from '../src/shared/schemas.ts';
import { GeminiProvider } from '../server/ai/gemini.ts';
import { SYSTEM, buildPrompt, cleanOutput } from '../server/ai/prompts.ts';
import { AiProviderError } from '../server/ai/provider.ts';

interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

interface Notebook {
  id: string;
  title: string;
  subjectId: string | null;
  mode: string;
  paper: string;
  background: string;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface Page {
  id: string;
  notebookId: string;
  index: number;
  elements: unknown;
  updatedAt: number;
}

interface Deck {
  id: string;
  title: string;
  subjectId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  box: number;
  due: number;
  createdAt: number;
  updatedAt: number;
}

interface Book {
  id: string;
  title: string;
  author: string | null;
  format: 'pdf' | 'epub' | 'txt';
  size: number;
  pageCount: number;
  progress: number;
  position: Record<string, unknown>;
  notebookId: string | null;
  openedAt: number | null;
}

interface UserStore {
  settings: Record<string, unknown>;
  activity: Record<string, number>;
  subjects: Subject[];
  notebooks: Notebook[];
  pages: Record<string, Page[]>; // notebookId -> pages
  notes: Record<string, unknown>; // notebookId -> content
  decks: Deck[];
  cards: Record<string, Card[]>; // deckId -> cards
  books: Book[];
  aiUsage?: Record<string, number>; // day -> count
}

const STORE_PATH = '/tmp/akshar_store.json';

function getInitialStore(): UserStore {
  const now = Date.now();
  const subPhys = { id: 'sub-phys', name: 'Physics', color: 'blue', createdAt: now, updatedAt: now };
  const subMath = { id: 'sub-math', name: 'Mathematics', color: 'purple', createdAt: now + 1, updatedAt: now + 1 };
  const subChem = { id: 'sub-chem', name: 'Chemistry', color: 'teal', createdAt: now + 2, updatedAt: now + 2 };
  const subHist = { id: 'sub-hist', name: 'History', color: 'orange', createdAt: now + 3, updatedAt: now + 3 };

  const deckPhys = { id: 'deck-phys', title: 'Mechanics essentials', subjectId: 'sub-phys', createdAt: now, updatedAt: now };
  const deckMath = { id: 'deck-math', title: 'Derivatives & integrals', subjectId: 'sub-math', createdAt: now + 1, updatedAt: now + 1 };
  const deckChem = { id: 'deck-chem', title: 'Functional groups', subjectId: 'sub-chem', createdAt: now + 2, updatedAt: now + 2 };
  const deckHist = { id: 'deck-hist', title: 'Freedom movement', subjectId: 'sub-hist', createdAt: now + 3, updatedAt: now + 3 };

  const cardsPhys: Card[] = [
    { id: 'c-p1', deckId: 'deck-phys', front: "State Newton's second law.", back: 'F = ma.', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-p2', deckId: 'deck-phys', front: 'What is the SI unit of force?', back: 'The newton (N) = 1 kg·m/s².', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-p3', deckId: 'deck-phys', front: "State Newton's third law.", back: 'For every action there is an equal and opposite reaction.', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-p4', deckId: 'deck-phys', front: 'What is inertia?', back: 'Tendency of an object to resist changes in motion.', box: 1, due: now, createdAt: now, updatedAt: now },
  ];

  const cardsMath: Card[] = [
    { id: 'c-m1', deckId: 'deck-math', front: 'd/dx of xⁿ', back: 'n·xⁿ⁻¹', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-m2', deckId: 'deck-math', front: 'd/dx of sin x', back: 'cos x', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-m3', deckId: 'deck-math', front: '∫ 1/x dx', back: 'ln|x| + C', box: 1, due: now, createdAt: now, updatedAt: now },
  ];

  const cardsChem: Card[] = [
    { id: 'c-c1', deckId: 'deck-chem', front: 'Functional group of alcohols', back: 'Hydroxyl group (–OH)', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-c2', deckId: 'deck-chem', front: 'Functional group of carboxylic acids', back: 'Carboxyl group (–COOH)', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-c3', deckId: 'deck-chem', front: 'Functional group of ketones', back: 'Carbonyl group (C=O) bonded to two carbon atoms', box: 1, due: now, createdAt: now, updatedAt: now },
  ];

  const cardsHist: Card[] = [
    { id: 'c-h1', deckId: 'deck-hist', front: 'In which year did India gain independence?', back: '1947', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-h2', deckId: 'deck-hist', front: 'Who led the Salt March of 1930?', back: 'Mahatma Gandhi', box: 1, due: now, createdAt: now, updatedAt: now },
    { id: 'c-h3', deckId: 'deck-hist', front: 'When was the Indian National Congress founded?', back: '1885', box: 1, due: now, createdAt: now, updatedAt: now },
  ];

  return {
    settings: {
      theme: 'light',
      font: 'sans',
      fontSize: 'medium',
      textSize: 'md',
      toolbarSide: 'left',
      language: 'en',
      locale: 'en',
      weeklyGoalHours: 10,
    },
    activity: {},
    aiUsage: {},
    subjects: [subPhys, subMath, subChem, subHist],
    notebooks: [],
    pages: {},
    notes: {},
    decks: [deckPhys, deckMath, deckChem, deckHist],
    cards: {
      'deck-phys': cardsPhys,
      'deck-math': cardsMath,
      'deck-chem': cardsChem,
      'deck-hist': cardsHist,
    },
    books: [],
  };
}

const memoryStores: Record<string, UserStore> = {};

function loadStore(uid: string): UserStore {
  if (memoryStores[uid]) return memoryStores[uid] as UserStore;
  try {
    if (existsSync(STORE_PATH)) {
      const all = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
      if (all && all[uid]) {
        memoryStores[uid] = all[uid];
        return memoryStores[uid] as UserStore;
      }
    }
  } catch {
    // Ignore read error
  }
  const fresh = getInitialStore();
  memoryStores[uid] = fresh;
  return fresh;
}

function persistStore(uid: string, store: UserStore) {
  memoryStores[uid] = store;
  try {
    writeFileSync(STORE_PATH, JSON.stringify(memoryStores));
  } catch {
    // Ignore write error on read-only environments
  }
}

async function readBody(req: IncomingMessage, maxBytes = 2_200_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;
    if (bytes > maxBytes) {
      throw new Error('payload-too-large');
    }
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

class BurstLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }
}

const aiBurstLimiter = new BurstLimiter(5, 60_000);

function abortOnClose(req: IncomingMessage): AbortSignal {
  const controller = new AbortController();
  req.socket?.once('close', () => controller.abort());
  return controller.signal;
}

function parseCards(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  return z
    .array(z.unknown())
    .catch([])
    .parse(raw)
    .flatMap((c) => {
      const parsed = aiCardSchema.safeParse(c);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 10);
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

function sendNoContent(res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.writeHead(204);
  res.end();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const rawUrl = req.url ?? '/';
  const url = new URL(rawUrl, 'http://localhost');
  let pathname = url.pathname;

  // Normalize /api/index.ts rewrites
  if (pathname.startsWith('/api/index.ts')) {
    const original = url.searchParams.get('path') || '';
    pathname = original.startsWith('/') ? `/api${original}` : `/api/${original}`;
  }

  const method = (req.method ?? 'GET').toUpperCase();
  const uid = (req.headers['x-akshar-user'] as string) || 'default-student';
  const store = loadStore(uid);

  try {
    // 1. Events (SSE)
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write('event: ping\ndata: "connected"\n\n');
      res.end();
      return;
    }

    // 2. Settings
    if (pathname === '/api/settings') {
      if (method === 'GET') {
        return sendJson(res, 200, store.settings);
      }
      if (method === 'PATCH') {
        const body = (await readBody(req)) as Record<string, unknown>;
        store.settings = { ...store.settings, ...body };
        persistStore(uid, store);
        return sendJson(res, 200, store.settings);
      }
    }

    // 3. Activity
    if (pathname === '/api/activity') {
      if (method === 'GET') {
        return sendJson(res, 200, store.activity);
      }
      if (method === 'POST') {
        const body = (await readBody(req)) as { day?: string; seconds?: number };
        if (body.day && body.seconds) {
          store.activity[body.day] = (store.activity[body.day] ?? 0) + body.seconds;
          persistStore(uid, store);
        }
        return sendJson(res, 200, { ok: true });
      }
    }

    // 4. Subjects
    if (pathname === '/api/subjects') {
      if (method === 'GET') {
        return sendJson(res, 200, store.subjects);
      }
      if (method === 'POST') {
        const body = (await readBody(req)) as { name: string; color: string };
        const now = Date.now();
        const id = `sub-${Math.random().toString(36).slice(2, 9)}`;
        const newSub: Subject = { id, name: body.name || 'Subject', color: body.color || 'blue', createdAt: now, updatedAt: now };
        store.subjects.push(newSub);
        persistStore(uid, store);
        return sendJson(res, 201, { id });
      }
    }
    const subMatch = pathname.match(/^\/api\/subjects\/([^/]+)$/);
    if (subMatch) {
      const subId = decodeURIComponent(subMatch[1] ?? '');
      if (method === 'PATCH') {
        const body = (await readBody(req)) as Partial<Subject>;
        const sub = store.subjects.find((s) => s.id === subId);
        if (sub) {
          if (body.name !== undefined) sub.name = body.name;
          if (body.color !== undefined) sub.color = body.color;
          sub.updatedAt = Date.now();
          persistStore(uid, store);
        }
        return sendNoContent(res);
      }
      if (method === 'DELETE') {
        store.subjects = store.subjects.filter((s) => s.id !== subId);
        persistStore(uid, store);
        return sendNoContent(res);
      }
    }

    // 5. Notebooks
    if (pathname === '/api/notebooks') {
      if (method === 'GET') {
        return sendJson(res, 200, store.notebooks);
      }
    }
    const nbIdMatch = pathname.match(/^\/api\/notebooks\/([^/]+)$/);
    if (nbIdMatch) {
      const nbId = decodeURIComponent(nbIdMatch[1] ?? '');
      if (method === 'GET') {
        const nb = store.notebooks.find((n) => n.id === nbId);
        if (!nb) {
          return sendJson(res, 200, {
            id: nbId,
            title: 'Notebook',
            subjectId: null,
            mode: 'paged',
            paper: 'dots',
            background: 'white',
            pageCount: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        return sendJson(res, 200, nb);
      }
      if (method === 'PUT') {
        const body = (await readBody(req)) as { title?: string; subjectId?: string | null };
        const now = Date.now();
        let nb = store.notebooks.find((n) => n.id === nbId);
        if (!nb) {
          nb = {
            id: nbId,
            title: body.title || 'Untitled',
            subjectId: body.subjectId ?? null,
            mode: 'paged',
            paper: 'dots',
            background: 'white',
            pageCount: 1,
            createdAt: now,
            updatedAt: now,
          };
          store.notebooks.unshift(nb);
          store.pages[nbId] = [{ id: 'p0', notebookId: nbId, index: 0, elements: [], updatedAt: now }];
        } else {
          if (body.title !== undefined) nb.title = body.title;
          if (body.subjectId !== undefined) nb.subjectId = body.subjectId;
          nb.updatedAt = now;
        }
        persistStore(uid, store);
        return sendJson(res, 201, { id: nbId });
      }
      if (method === 'PATCH') {
        const body = (await readBody(req)) as Partial<Notebook>;
        const nb = store.notebooks.find((n) => n.id === nbId);
        if (nb) {
          Object.assign(nb, body, { updatedAt: Date.now() });
          persistStore(uid, store);
        }
        return sendNoContent(res);
      }
      if (method === 'DELETE') {
        store.notebooks = store.notebooks.filter((n) => n.id !== nbId);
        Reflect.deleteProperty(store.pages, nbId);
        Reflect.deleteProperty(store.notes, nbId);
        persistStore(uid, store);
        return sendNoContent(res);
      }
    }

    // 6. Pages
    const pagesMatch = pathname.match(/^\/api\/notebooks\/([^/]+)\/pages$/);
    if (pagesMatch) {
      const nbId = decodeURIComponent(pagesMatch[1] ?? '');
      if (method === 'GET') {
        const pages = store.pages[nbId] ?? [{ id: 'p0', notebookId: nbId, index: 0, elements: [], updatedAt: Date.now() }];
        return sendJson(res, 200, pages);
      }
    }
    const pageIdMatch = pathname.match(/^\/api\/notebooks\/([^/]+)\/pages\/([^/]+)$/);
    if (pageIdMatch) {
      const nbId = decodeURIComponent(pageIdMatch[1] ?? '');
      const pageId = decodeURIComponent(pageIdMatch[2] ?? '');
      if (method === 'PUT') {
        const body = (await readBody(req)) as { index?: number; elements?: unknown };
        const now = Date.now();
        if (!store.pages[nbId]) store.pages[nbId] = [];
        const existing = store.pages[nbId].find((p) => p.id === pageId);
        if (existing) {
          if (body.index !== undefined) existing.index = body.index;
          if (body.elements !== undefined) existing.elements = body.elements;
          existing.updatedAt = now;
        } else {
          store.pages[nbId].push({
            id: pageId,
            notebookId: nbId,
            index: body.index ?? store.pages[nbId].length,
            elements: body.elements ?? [],
            updatedAt: now,
          });
        }
        persistStore(uid, store);
        return sendJson(res, 200, { id: pageId, updatedAt: now });
      }
    }

    // 7. Notes
    const noteMatch = pathname.match(/^\/api\/notebooks\/([^/]+)\/note$/);
    if (noteMatch) {
      const nbId = decodeURIComponent(noteMatch[1] ?? '');
      if (method === 'GET') {
        const content = (store.notes[nbId] as Record<string, unknown> | null | undefined) ?? null;
        return sendJson(res, 200, { content, updatedAt: Date.now() });
      }
      if (method === 'PUT') {
        const body = (await readBody(req)) as { content?: unknown };
        store.notes[nbId] = body.content ?? null;
        persistStore(uid, store);
        return sendJson(res, 200, { updatedAt: Date.now() });
      }
    }

    // 8. Decks & Cards
    if (pathname === '/api/decks') {
      if (method === 'GET') {
        const decksWithCounts = store.decks.map((d) => {
          const cards = store.cards[d.id] ?? [];
          return {
            ...d,
            cardCount: cards.length,
            dueCount: cards.filter((c) => c.due <= Date.now()).length,
          };
        });
        return sendJson(res, 200, decksWithCounts);
      }
      if (method === 'POST') {
        const body = (await readBody(req)) as { title: string; subjectId: string | null };
        const id = `deck-${Math.random().toString(36).slice(2, 9)}`;
        const now = Date.now();
        store.decks.push({ id, title: body.title, subjectId: body.subjectId, createdAt: now, updatedAt: now });
        store.cards[id] = [];
        persistStore(uid, store);
        return sendJson(res, 201, { id });
      }
    }
    const deckCardsMatch = pathname.match(/^\/api\/decks\/([^/]+)\/cards$/);
    if (deckCardsMatch) {
      const deckId = decodeURIComponent(deckCardsMatch[1] ?? '');
      if (method === 'GET') {
        return sendJson(res, 200, store.cards[deckId] ?? []);
      }
      if (method === 'POST') {
        const body = (await readBody(req)) as { front: string; back: string };
        const id = `c-${Math.random().toString(36).slice(2, 9)}`;
        const now = Date.now();
        const newCard: Card = { id, deckId, front: body.front, back: body.back, box: 1, due: now, createdAt: now, updatedAt: now };
        if (!store.cards[deckId]) store.cards[deckId] = [];
        store.cards[deckId].push(newCard);
        persistStore(uid, store);
        return sendJson(res, 201, { id });
      }
    }

    // 9. Due Cards & Stats
    if (pathname === '/api/cards/due-count') {
      let count = 0;
      const now = Date.now();
      for (const deckCards of Object.values(store.cards)) {
        count += deckCards.filter((c) => c.due <= now).length;
      }
      return sendJson(res, 200, { count });
    }
    if (pathname === '/api/cards/due') {
      const now = Date.now();
      const dueCards: Card[] = [];
      for (const deckCards of Object.values(store.cards)) {
        dueCards.push(...deckCards.filter((c) => c.due <= now));
      }
      return sendJson(res, 200, dueCards);
    }
    if (pathname === '/api/flashcards/stats') {
      let total = 0;
      let dueToday = 0;
      const boxes = [0, 0, 0, 0, 0];
      const now = Date.now();
      for (const deckCards of Object.values(store.cards)) {
        for (const c of deckCards) {
          total++;
          if (c.due <= now) dueToday++;
          const b = Math.max(1, Math.min(5, c.box)) - 1;
          boxes[b] = (boxes[b] ?? 0) + 1;
        }
      }
      return sendJson(res, 200, { total, dueToday, reviewedToday: 0, boxes });
    }

    // 10. Books
    if (pathname === '/api/books') {
      if (method === 'GET') {
        return sendJson(res, 200, store.books);
      }
      if (method === 'POST') {
        const id = `b-${Math.random().toString(36).slice(2, 9)}`;
        const header = (h: string) => {
          const v = req.headers[h];
          if (typeof v !== 'string') return '';
          try {
            return decodeURIComponent(v).trim();
          } catch {
            return v.trim();
          }
        };
        const rawFileName = header('x-file-name') || 'book.pdf';
        const format = (rawFileName.toLowerCase().split('.').pop() || 'pdf') as 'pdf' | 'epub' | 'txt';
        const title = header('x-title') || rawFileName.replace(/\.[^.]+$/, '') || 'Untitled';
        const author = header('x-author') || null;
        const pageCount = Number(header('x-page-count')) || 0;
        const newBook: Book = {
          id,
          title,
          author,
          format: ['pdf', 'epub', 'txt'].includes(format) ? format : 'pdf',
          size: Number(req.headers['content-length']) || 0,
          pageCount,
          progress: 0,
          position: {},
          notebookId: null,
          openedAt: Date.now(),
        };
        store.books.unshift(newBook);
        persistStore(uid, store);
        return sendJson(res, 201, { id });
      }
    }
    const bookIdMatch = pathname.match(/^\/api\/books\/([^/]+)$/);
    if (bookIdMatch) {
      const bookId = decodeURIComponent(bookIdMatch[1] ?? '');
      const book = store.books.find((b) => b.id === bookId);
      if (!book) return sendJson(res, 404, { error: 'not-found' });
      if (method === 'GET') return sendJson(res, 200, book);
      if (method === 'PATCH') {
        const body = (await readBody(req)) as Partial<Book>;
        Object.assign(book, body);
        persistStore(uid, store);
        return sendNoContent(res);
      }
      if (method === 'DELETE') {
        store.books = store.books.filter((b) => b.id !== bookId);
        persistStore(uid, store);
        return sendNoContent(res);
      }
    }
    const bookFileMatch = pathname.match(/^\/api\/books\/([^/]+)\/file$/);
    if (bookFileMatch) {
      const bookId = decodeURIComponent(bookFileMatch[1] ?? '');
      const book = store.books.find((b) => b.id === bookId);
      if (!book) return sendJson(res, 404, { error: 'not-found' });
      res.writeHead(200, {
        'Content-Type':
          book.format === 'pdf'
            ? 'application/pdf'
            : book.format === 'epub'
              ? 'application/epub+zip'
              : 'text/plain',
        'Content-Disposition': 'attachment',
      });
      res.end(Buffer.from(book.format === 'pdf' ? '%PDF-1.7\n%test\n' : 'Book content'));
      return;
    }
    if (pathname.match(/^\/api\/books\/([^/]+)\/highlights$/)) {
      return sendJson(res, 200, []);
    }

    // 11. Storage & Search
    if (pathname === '/api/account/storage') {
      const booksBytes = store.books.reduce((acc, b) => acc + (b.size || 0), 0);
      return sendJson(res, 200, {
        used: booksBytes,
        limit: 200 * 1024 * 1024,
        books: { count: store.books.length, bytes: booksBytes },
        images: { count: 0, bytes: 0 },
      });
    }

    if (pathname === '/api/search-index') {
      return sendJson(res, 200, {
        subjects: store.subjects.map((s) => ({ id: s.id, name: s.name })),
        notebooks: store.notebooks.map((n) => ({ id: n.id, title: n.title, subjectId: n.subjectId })),
        books: store.books.map((b) => ({ id: b.id, title: b.title, author: b.author })),
        decks: store.decks.map((d) => ({ id: d.id, title: d.title })),
      });
    }

    // 12. AI status & run
    if (pathname === '/api/ai/status') {
      if (method !== 'GET') {
        return sendJson(res, 405, { error: 'method-not-allowed' });
      }
      const today = new Date().toISOString().slice(0, 10);
      const usedToday = store.aiUsage?.[today] ?? 0;
      const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
      return sendJson(res, 200, {
        enabled: Boolean(key),
        limit: AI_DAILY_LIMIT,
        used: usedToday,
      });
    }

    if (pathname === '/api/ai/run') {
      if (method !== 'POST') {
        return sendJson(res, 405, { error: 'method-not-allowed' });
      }

      // Check CSRF
      if (req.headers['x-akshar'] !== '1') {
        return sendJson(res, 403, { error: 'csrf' });
      }

      // Check authentication (requires X-Akshar-User or cookie)
      if (!req.headers['x-akshar-user'] && !req.headers.cookie) {
        return sendJson(res, 401, { error: 'unauthorized' });
      }

      const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
      if (!key) {
        return sendJson(res, 503, { error: 'ai-disabled' });
      }

      // Burst rate limiter: max 5 requests per 60 seconds
      if (!aiBurstLimiter.take(uid)) {
        return sendJson(res, 429, { error: 'rate-limited' });
      }

      // Daily quota: max 20 requests per day
      const today = new Date().toISOString().slice(0, 10);
      store.aiUsage = store.aiUsage ?? {};
      const usedToday = store.aiUsage[today] ?? 0;
      if (usedToday >= AI_DAILY_LIMIT) {
        return sendJson(res, 429, { error: 'quota' });
      }

      // Validate request body
      const rawBody = await readBody(req, 2_200_000);
      const parsedBody = aiRequestSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return sendJson(res, 400, { error: 'invalid' });
      }
      const body = parsedBody.data;

      // Reserve quota
      store.aiUsage[today] = usedToday + 1;
      persistStore(uid, store);

      const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
      const provider = new GeminiProvider(key, model);
      const signal = AbortSignal.any([
        AbortSignal.timeout(25_000),
        abortOnClose(req),
      ]);

      const started = Date.now();
      let status = 'ok';
      let detail: string | undefined;
      let tokens: { in?: number; out?: number } = {};

      try {
        const out = await provider.generate({
          system: SYSTEM,
          prompt: buildPrompt(body),
          imagePng: body.image?.slice('data:image/png;base64,'.length),
          json: body.action === 'flashcards',
          maxOutputTokens: body.action === 'flashcards' ? 1500 : 1024,
          signal,
        });

        tokens = { in: out.inputTokens, out: out.outputTokens };

        if (body.action === 'flashcards') {
          const cards = parseCards(out.text);
          if (cards.length === 0) {
            throw new AiProviderError('provider');
          }
          return sendJson(res, 200, { text: '', cards });
        }
        return sendJson(res, 200, { text: cleanOutput(out.text) });
      } catch (error) {
        // Refund quota on failure
        store.aiUsage[today] = Math.max(0, (store.aiUsage[today] ?? 1) - 1);
        persistStore(uid, store);

        status = error instanceof AiProviderError ? error.code : 'error';
        if (error instanceof AiProviderError) detail = error.detail;

        if (error instanceof AiProviderError) {
          const statusCode = error.code === 'timeout' ? 504 : error.code === 'blocked' ? 422 : 502;
          return sendJson(res, statusCode, { error: `ai-${error.code}` });
        }
        return sendJson(res, 500, { error: 'server' });
      } finally {
        // Metadata only: never the prompt, answer, or key
        const hashed = createHash('sha256').update(uid).digest('hex').slice(0, 12);
        console.log(
          JSON.stringify({
            event: 'ai',
            user: hashed,
            action: body.action,
            status,
            detail,
            ms: Date.now() - started,
            tokensIn: tokens.in,
            tokensOut: tokens.out,
          }),
        );
      }
    }

    // Default fallback: 200 OK with empty object to prevent breaking UI
    return sendJson(res, 200, {});
  } catch (error) {
    if (error instanceof Error && error.message === 'payload-too-large') {
      return sendJson(res, 413, { error: 'payload-too-large' });
    }
    console.error('API Error:', error);
    return sendJson(res, 500, { error: 'server' });
  }
}
