import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routeTable } from '../../server/routes.ts';
import { CSP } from '../../server/security.ts';
import { unzip } from '../../src/shared/zip.ts';
import { Client, PNG, startServer } from './harness.ts';

/**
 * Walks the server's real route table, so a route added later is covered
 * automatically: sessions, CSRF, and cross-user isolation.
 */

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.stop());

const client = () => new Client(server.base);
let n = 0;
const uname = (p: string) => `${p}${++n}${Date.now() % 100000}`;

const PUBLIC = new Set([
  'GET /api/auth/me',
  'POST /api/auth/signup',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/events',
]);
/** Routes handled in app.ts rather than the table. */
const EXTRA = [
  { method: 'GET', path: '/api/ai/status' },
  { method: 'POST', path: '/api/ai/run' },
  { method: 'GET', path: `/api/files/images/${'a'.repeat(32)}.png` },
];
const all = () => [...routeTable(), ...EXTRA];
const fill = (path: string, ids: Record<string, string> = {}) =>
  path.replace(/:(\w+)/g, (_, name: string) => ids[name] ?? 'x1');

describe('every route', () => {
  it('needs a session (except sign-up, login, logout, "me" and the reachability stream)', async () => {
    const anon = client();
    const open: string[] = [];
    for (const r of all()) {
      if (PUBLIC.has(`${r.method} ${r.path}`)) continue;
      const res = await anon.json(r.method, fill(r.path), r.method === 'GET' ? undefined : {});
      if (res.status !== 401) open.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('rejects writes without the CSRF header or from another origin', async () => {
    const c = await client().signUp(uname('csrf'));
    const unprotected: string[] = [];
    for (const r of all()) {
      if (r.method === 'GET') continue;
      const noHeader = await c.json(r.method, fill(r.path), {}, { csrf: false });
      const foreign = await c.raw(r.method, fill(r.path), {
        body: '{}',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      });
      if (noHeader.status !== 403 || foreign.status !== 403)
        unprotected.push(`${r.method} ${r.path} -> ${noHeader.status}/${foreign.status}`);
    }
    expect(unprotected).toEqual([]);
  });

  it("never lets one user read or change another user's data", async () => {
    // Alice creates one of everything, marked with a secret.
    const alice = await client().signUp(uname('alice'));
    const SECRET = 'alice-secret-7731';
    const ok = async (res: Promise<Response>) => {
      const r = await res;
      expect(r.status, await r.clone().text()).toBeLessThan(300);
      return r;
    };
    const subject = (
      (await (await ok(alice.json('POST', '/api/subjects', { name: SECRET, color: 'blue' }))).json()) as {
        id: string;
      }
    ).id;
    await ok(alice.json('PUT', '/api/notebooks/nbA', { title: SECRET, subjectId: subject }));
    await ok(
      alice.json('PUT', '/api/notebooks/nbA/pages/p0', {
        index: 0,
        elements: [{ k: 't', id: 't1', c: '#0f2a4a', f: 'sans', s: 32, x: 1, y: 1, bw: 300, v: SECRET }],
      }),
    );
    await ok(
      alice.json('PUT', '/api/notebooks/nbA/note', {
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: SECRET }] }] },
      }),
    );
    const image = (
      (await (
        await ok(
          alice.raw('POST', '/api/notebooks/nbA/images', { body: PNG, headers: { 'X-File-Name': 'a.png' } }),
        )
      ).json()) as { url: string }
    ).url;
    const book = (
      (await (
        await ok(
          alice.raw('POST', '/api/books', {
            body: Buffer.from(`%PDF-1.7\n${SECRET}\n`),
            headers: { 'X-File-Name': 'a.pdf', 'X-Title': SECRET },
          }),
        )
      ).json()) as { id: string }
    ).id;
    const highlight = (
      (await (
        await ok(
          alice.json('POST', `/api/books/${book}/highlights`, {
            section: 0,
            exact: SECRET,
            prefix: '',
            suffix: '',
          }),
        )
      ).json()) as { id: string }
    ).id;
    const deck = (
      (await (await ok(alice.json('POST', '/api/decks', { title: SECRET, subjectId: null }))).json()) as {
        id: string;
      }
    ).id;
    const card = (
      (await (
        await ok(alice.json('POST', `/api/decks/${deck}/cards`, { front: SECRET, back: SECRET }))
      ).json()) as { id: string }
    ).id;
    await ok(alice.raw('POST', '/api/account/avatar', { body: PNG, headers: { 'X-File-Name': 'me.png' } }));

    const snapshot = async () => {
      const zip = await unzip(new Uint8Array(await (await alice.raw('GET', '/api/export')).arrayBuffer()));
      const data = JSON.parse(new TextDecoder().decode(zip.get('data.json'))) as Record<string, unknown>;
      delete data.exportedAt;
      return { data, files: [...zip.keys()].sort() };
    };
    const before = await snapshot();
    expect(JSON.stringify(before.data)).toContain(SECRET);

    // Bob calls every route with Alice's ids.
    const bob = await client().signUp(uname('bob'));
    const idFor = (path: string): Record<string, string> => {
      const id = path.startsWith('/api/subjects')
        ? subject
        : path.startsWith('/api/notebooks')
          ? 'nbA'
          : path.startsWith('/api/books')
            ? book
            : path.startsWith('/api/decks')
              ? deck
              : card;
      return { id, pageId: 'p0', hid: highlight };
    };
    const leaks: string[] = [];
    for (const r of all()) {
      // Deleting or signing out would end Bob's session; the event stream never ends
      // (it only ever carries topic names for the session's own user).
      if (['/api/account/delete', '/api/auth/logout', '/api/events'].includes(r.path)) continue;
      const path = r.path.startsWith('/api/files/images/') ? image : fill(r.path, idFor(r.path));
      const body =
        r.method === 'GET'
          ? undefined
          : r.path.endsWith('/pages/:pageId')
            ? { index: 0, elements: [] }
            : r.path.endsWith('/note')
              ? { content: { type: 'doc', content: [] } }
              : r.path.endsWith('/review')
                ? { result: 'know' }
                : { title: 'bob', name: 'bob', front: 'bob', back: 'bob', subjectId: null };
      const res = await bob.json(r.method, path, body);
      const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
      if (text.includes(SECRET) || text.includes(image.split('/').pop() ?? '-'))
        leaks.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);

    // Alice's data and files are exactly as they were.
    expect(await snapshot()).toEqual(before);
  });

  it('sends the security headers on API responses and errors', async () => {
    for (const path of ['/api/auth/me', '/api/nope', '/api/notebooks']) {
      const res = await client().raw('GET', path);
      expect(res.headers.get('content-security-policy')).toBe(CSP);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('permissions-policy')).toContain('camera=()');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    }
    expect(CSP).not.toContain('unsafe-eval');
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("script-src 'self'");
  });
});
