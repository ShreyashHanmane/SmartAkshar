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
const uname = (p: string) => `${p}${++n}${Date.now() % 100000}`;
type Me = { user: { id: string; displayName: string; avatarUrl: string | null } };
const me = async (c: Client) => ((await (await c.json('GET', '/api/auth/me')).json()) as Me).user;
const upload = (c: Client, body: BodyInit, name = 'me.png') =>
  c.raw('POST', '/api/account/avatar', { body, headers: { 'X-File-Name': name } });

describe('account', () => {
  it('sets, replaces and removes the profile photo; only the owner can see it', async () => {
    const c = await client().signUp(uname('pic'));
    expect((await me(c)).avatarUrl).toBeNull();

    const first = await upload(c, PNG);
    expect(first.status).toBe(200);
    const url1 = ((await first.json()) as Me).user.avatarUrl ?? '';
    expect(url1).toMatch(/^\/api\/files\/images\/[0-9a-f]{32}\.png$/);
    expect((await c.raw('GET', url1)).status).toBe(200);

    const other = await client().signUp(uname('other'));
    expect((await other.raw('GET', url1)).status).toBe(404);

    // Replacing removes the old file from disk and from the quota.
    const url2 = ((await (await upload(c, PNG)).json()) as Me).user.avatarUrl ?? '';
    expect(url2).not.toBe(url1);
    expect((await c.raw('GET', url1)).status).toBe(404);
    const { id } = await me(c);
    const images = () => readdirSync(dataPath(server.dataDir, 'files', id, 'images'));
    expect(images()).toEqual([url2.split('/').pop()]);

    expect((await c.json('DELETE', '/api/account/avatar')).status).toBe(200);
    expect((await me(c)).avatarUrl).toBeNull();
    expect(images()).toEqual([]);
  });

  it('rejects photos that are not images, are disguised, or are too big', async () => {
    const c = await client().signUp(uname('bad'));
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(c, svg, 'x.png')).status).toBe(415);
    expect((await upload(c, PNG, 'x.jpg')).status).toBe(415);
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary');
    expect((await upload(c, gif, 'x.gif')).status).toBe(415);
    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 1)]);
    expect((await upload(c, big)).status).toBe(413);
    expect((await me(c)).avatarUrl).toBeNull();
    expect(
      (await client().raw('POST', '/api/account/avatar', { body: PNG, headers: { 'X-File-Name': 'a.png' } }))
        .status,
    ).toBe(401);
  });

  it('reports real storage numbers', async () => {
    const c = await client().signUp(uname('store'));
    const empty = (await (await c.json('GET', '/api/account/storage')).json()) as Record<string, unknown>;
    expect(empty).toEqual({
      used: 0,
      limit: 200 * 1024 * 1024,
      books: { count: 0, bytes: 0 },
      images: { count: 0, bytes: 0 },
    });
    await upload(c, PNG);
    await c.raw('POST', '/api/books', {
      body: Buffer.from('%PDF-1.7\n%test\n'),
      headers: { 'X-File-Name': 'a.pdf', 'X-Title': 'A' },
    });
    const after = (await (await c.json('GET', '/api/account/storage')).json()) as {
      used: number;
      books: { count: number; bytes: number };
      images: { count: number; bytes: number };
    };
    expect(after.books).toEqual({ count: 1, bytes: 15 });
    expect(after.images).toEqual({ count: 1, bytes: PNG.length });
    expect(after.used).toBe(15 + PNG.length);
    expect((await client().raw('GET', '/api/account/storage')).status).toBe(401);
  });

  it('limits password guesses when deleting the account', async () => {
    const c = await client().signUp(uname('guess'));
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await c.json('POST', '/api/account/delete', { password: `x${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    const { id } = await me(c);
    expect(existsSync(dataPath(server.dataDir, 'files', id))).toBe(false); // never created, never deleted
    expect((await c.json('GET', '/api/auth/me')).status).toBe(200);
  });
});
