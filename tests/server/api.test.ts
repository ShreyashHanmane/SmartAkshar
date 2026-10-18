import { existsSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, PNG, dataPath, startServer } from './harness.ts';

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.stop());

const client = () => new Client(server.base);
let n = 0;
const uname = (tag: string) => `${tag}${++n}`;
const page = (elements: unknown[] = []) => ({ index: 0, elements });
const stroke = { k: 's', id: 's1', tool: 'pen', c: '#0f2a4a', w: 3, o: 1, pts: 'AAAAAAAA' };

describe('accounts', () => {
  it('signs up, reports the session, logs out, and logs back in', async () => {
    const c = client();
    const name = uname('asha');
    await c.signUp(name, 'study1234', 'Asha');
    expect(await (await c.json('GET', '/api/auth/me')).json()).toMatchObject({
      user: { username: name, displayName: 'Asha' },
    });
    expect((await c.json('POST', '/api/auth/logout')).status).toBe(204);
    expect(await (await c.json('GET', '/api/auth/me')).json()).toEqual({ user: null });
    expect(
      (await c.json('POST', '/api/auth/login', { username: name.toUpperCase(), password: 'study1234' }))
        .status,
    ).toBe(200);
  });

  it('rejects taken usernames, weak passwords, and bad shapes', async () => {
    const name = uname('dup');
    await client().signUp(name);
    expect(
      (await client().json('POST', '/api/auth/signup', { name: 'x', username: name, password: 'study1234' }))
        .status,
    ).toBe(409);
    expect(
      (
        await client().json('POST', '/api/auth/signup', {
          name: 'x',
          username: uname('w'),
          password: 'short',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client().json('POST', '/api/auth/signup', {
          name: 'x',
          username: 'bad name!',
          password: 'study1234',
        })
      ).status,
    ).toBe(400);
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    const name = uname('who');
    await client().signUp(name);
    const wrong = await client().json('POST', '/api/auth/login', { username: name, password: 'nope12345' });
    const unknown = await client().json('POST', '/api/auth/login', {
      username: uname('ghost'),
      password: 'nope12345',
    });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('rate-limits repeated login attempts', async () => {
    const name = uname('rl');
    await client().signUp(name);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push(
        (await client().json('POST', '/api/auth/login', { username: name, password: 'wrong1234' })).status,
      );
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('requires the CSRF header and a same-origin Origin for writes', async () => {
    const c = await client().signUp(uname('csrf'));
    expect(
      (await c.json('POST', '/api/subjects', { name: 'P', color: 'blue' }, { csrf: false })).status,
    ).toBe(403);
    const res = await c.raw('POST', '/api/subjects', {
      body: JSON.stringify({ name: 'P', color: 'blue' }),
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('changes the password and deletes the account with all its files', async () => {
    const c = await client().signUp(uname('del'));
    expect(
      (await c.json('POST', '/api/auth/password', { current: 'wrong', next: 'newpass123' })).status,
    ).toBe(401);
    expect(
      (await c.json('POST', '/api/auth/password', { current: 'study1234', next: 'newpass123' })).status,
    ).toBe(204);
    await c.json('PUT', '/api/notebooks/nb1', { title: 'N', subjectId: null });
    const up = await c.raw('POST', '/api/notebooks/nb1/images', {
      body: PNG,
      headers: { 'X-File-Name': 'a.png' },
    });
    expect(up.status).toBe(201);
    const me = (await (await c.json('GET', '/api/auth/me')).json()) as { user: { id: string } };
    expect(existsSync(dataPath(server.dataDir, 'files', me.user.id))).toBe(true);
    expect((await c.json('POST', '/api/account/delete', { password: 'study1234' })).status).toBe(401);
    expect((await c.json('POST', '/api/account/delete', { password: 'newpass123' })).status).toBe(204);
    expect(existsSync(dataPath(server.dataDir, 'files', me.user.id))).toBe(false);
    expect(await (await c.json('GET', '/api/auth/me')).json()).toEqual({ user: null });
  });
});

describe('authorization', () => {
  it('requires a session for every data route', async () => {
    const anon = client();
    for (const [method, path] of [
      ['GET', '/api/settings'],
      ['GET', '/api/subjects'],
      ['GET', '/api/notebooks'],
      ['GET', '/api/notebooks/x/pages'],
      ['GET', '/api/books'],
      ['GET', '/api/activity'],
      ['GET', '/api/search-index'],
      ['GET', `/api/files/images/${'a'.repeat(32)}.png`],
    ] as const)
      expect((await anon.json(method, path)).status, path).toBe(401);
  });

  it("keeps each student's data private", async () => {
    const alice = await client().signUp(uname('alice'));
    const bob = await client().signUp(uname('bob'));
    await alice.json('PUT', '/api/notebooks/secret', { title: 'Diary', subjectId: null });
    await alice.json('PUT', '/api/notebooks/secret/pages/p0', page([stroke]));
    await alice.json('PUT', '/api/notebooks/secret/note', { content: { type: 'doc' } });
    const img = (await (
      await alice.raw('POST', '/api/notebooks/secret/images', {
        body: PNG,
        headers: { 'X-File-Name': 'a.png' },
      })
    ).json()) as {
      url: string;
    };

    expect(await (await bob.json('GET', '/api/notebooks')).json()).toEqual([]);
    for (const [method, path, body] of [
      ['GET', '/api/notebooks/secret'],
      ['GET', '/api/notebooks/secret/pages'],
      ['GET', '/api/notebooks/secret/note'],
      ['PUT', '/api/notebooks/secret/pages/p0', page()],
      ['PUT', '/api/notebooks/secret/note', { content: { type: 'doc' } }],
      ['PATCH', '/api/notebooks/secret', { title: 'mine' }],
      ['GET', img.url],
    ] as const)
      expect((await bob.json(method, path, body)).status, `${method} ${path}`).toBe(404);
    // Bob's delete is a no-op for Alice's data.
    await bob.json('DELETE', '/api/notebooks/secret');
    expect((await alice.json('GET', '/api/notebooks/secret')).status).toBe(200);
    expect((await alice.json('GET', img.url)).status).toBe(200);
  });
});

describe('validation', () => {
  it('rejects malformed pages, unknown fields, and oversize content', async () => {
    const c = await client().signUp(uname('val'));
    await c.json('PUT', '/api/notebooks/nb', { title: 'N', subjectId: null });
    expect(
      (await c.json('PUT', '/api/notebooks/nb/pages/p0', page([{ k: 's', id: 'x', tool: 'pen', c: 'red' }])))
        .status,
    ).toBe(400);
    expect((await c.json('PATCH', '/api/notebooks/nb', { owner: 'bob' })).status).toBe(400);
    expect((await c.json('PATCH', '/api/settings', { theme: 'neon' })).status).toBe(400);
    expect((await c.json('POST', '/api/activity', { day: '2026-10-18', seconds: 5000 })).status).toBe(400);
    const huge = Array.from({ length: 5 }, (_, i) => ({ ...stroke, id: `s${i}`, pts: 'A'.repeat(199_996) }));
    expect((await c.json('PUT', '/api/notebooks/nb/pages/p0', page(huge))).status).toBe(413);
    expect((await c.json('PUT', '/api/notebooks/nb/pages/p0', page([stroke]))).status).toBe(200);
  });

  it('cleans notes on the server (no scripts, unsafe links, or foreign images)', async () => {
    const c = await client().signUp(uname('note'));
    await c.json('PUT', '/api/notebooks/nb', { title: 'N', subjectId: null });
    await c.json('PUT', '/api/notebooks/nb/note', {
      content: {
        type: 'doc',
        content: [
          { type: 'script', content: [{ type: 'text', text: 'x' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'hi', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            ],
          },
          { type: 'image', attrs: { src: 'https://tracker.example/p.png' } },
        ],
      },
    });
    const saved = JSON.stringify(await (await c.json('GET', '/api/notebooks/nb/note')).json());
    expect(saved).not.toMatch(/script|javascript|tracker/);
    expect(saved).toContain('"hi"');
  });
});

describe('uploads', () => {
  it('accepts real files and rejects disguised ones', async () => {
    const c = await client().signUp(uname('up'));
    await c.json('PUT', '/api/notebooks/nb', { title: 'N', subjectId: null });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(
      (await c.raw('POST', '/api/notebooks/nb/images', { body: svg, headers: { 'X-File-Name': 'evil.png' } }))
        .status,
    ).toBe(415);
    expect(
      (await c.raw('POST', '/api/notebooks/nb/images', { body: PNG, headers: { 'X-File-Name': 'a.jpg' } }))
        .status,
    ).toBe(415);
    const ok = await c.raw('POST', '/api/notebooks/nb/images', {
      body: PNG,
      headers: { 'X-File-Name': 'a.png' },
    });
    const { url } = (await ok.json()) as { url: string };
    expect(url).toMatch(/^\/api\/files\/images\/[0-9a-f]{32}\.png$/);
    const served = await c.json('GET', url);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('content-security-policy')).toContain('sandbox');

    const pdf = Buffer.from('%PDF-1.7\n%test\n');
    const book = await c.raw('POST', '/api/books', {
      body: pdf,
      headers: { 'X-File-Name': 'Mechanics.pdf', 'X-Title': 'Mechanics', 'X-Page-Count': '48' },
    });
    expect(book.status).toBe(201);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect(
      (await c.raw('POST', '/api/books', { body: html, headers: { 'X-File-Name': 'page.pdf' } })).status,
    ).toBe(415);
    expect(
      (await c.raw('POST', '/api/books', { body: html, headers: { 'X-File-Name': 'page.html' } })).status,
    ).toBe(415);
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 10, 0x89);
    tooBig.set(PNG.subarray(0, 8));
    expect(
      (
        await c.raw('POST', '/api/notebooks/nb/images', {
          body: tooBig,
          headers: { 'X-File-Name': 'big.png' },
        })
      ).status,
    ).toBe(413);
    // Failed uploads leave no files behind.
    const me = (await (await c.json('GET', '/api/auth/me')).json()) as { user: { id: string } };
    expect(readdirSync(dataPath(server.dataDir, 'files', me.user.id, 'images'))).toHaveLength(1);
  });

  it('serves book files only to their owner, as downloads', async () => {
    const alice = await client().signUp(uname('ba'));
    const bob = await client().signUp(uname('bb'));
    const res = await alice.raw('POST', '/api/books', {
      body: Buffer.from('Chapter 1\n\nText'),
      headers: { 'X-File-Name': 'notes.txt' },
    });
    const { id } = (await res.json()) as { id: string };
    const file = await alice.json('GET', `/api/books/${id}/file`);
    expect(file.headers.get('content-disposition')).toBe('attachment');
    expect(await file.text()).toContain('Chapter 1');
    expect((await bob.json('GET', `/api/books/${id}/file`)).status).toBe(404);
    expect(
      (
        await bob.json('POST', `/api/books/${id}/highlights`, {
          section: 0,
          exact: 'x',
          prefix: '',
          suffix: '',
        })
      ).status,
    ).toBe(404);
  });
});

describe('live updates', () => {
  it('lets signed-out pages connect (for reachability) without receiving anything', async () => {
    const res = await fetch(`${server.base}/api/events`);
    expect(res.status).toBe(200);
    await res.body?.cancel();
  });

  it('notifies the owner (topics only), not other users', async () => {
    const alice = await client().signUp(uname('ev'));
    const ctrl = new AbortController();
    const res = await fetch(`${server.base}/api/events`, {
      headers: { Cookie: alice.cookie },
      signal: ctrl.signal,
    });
    const reader = res.body?.getReader();
    await alice.json('POST', '/api/subjects', { name: 'Physics', color: 'blue' });
    let text = '';
    const decoder = new TextDecoder();
    while (!text.includes('subjects')) text += decoder.decode((await reader?.read())?.value);
    expect(text).toContain('data: "subjects"');
    expect(text).not.toContain('Physics');
    ctrl.abort();
  });
});
