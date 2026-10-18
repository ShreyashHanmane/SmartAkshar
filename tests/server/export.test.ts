import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unzip } from '../../src/shared/zip.ts';
import { Client, PNG, startServer } from './harness.ts';

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.stop());

const client = () => new Client(server.base);
let n = 0;
const uname = (p: string) => `${p}${++n}${Date.now() % 100000}`;

async function download(c: Client) {
  const res = await c.raw('GET', '/api/export');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('application/zip');
  expect(res.headers.get('content-disposition')).toMatch(
    /^attachment; filename="akshar-export-\d{4}-\d\d-\d\d\.zip"$/,
  );
  expect(res.headers.get('cache-control')).toBe('no-store');
  return unzip(new Uint8Array(await res.arrayBuffer()));
}

describe('full data export', () => {
  it('contains everything the user created, and their files', async () => {
    const c = await client().signUp(uname('exp'), 'study1234', 'Asha', true);
    await c.json('PUT', '/api/notebooks/nb1', { title: 'Optics', subjectId: null });
    const saved = await c.json('PUT', '/api/notebooks/nb1/pages/p0', {
      index: 0,
      elements: [{ k: 't', id: 't1', c: '#0f2a4a', f: 'sans', s: 32, x: 10, y: 20, bw: 300, v: 'Snell' }],
    });
    expect(saved.status).toBe(200);
    const img = (await (
      await c.raw('POST', '/api/notebooks/nb1/images', { body: PNG, headers: { 'X-File-Name': 'a.png' } })
    ).json()) as { url: string };
    await c.json('PUT', '/api/notebooks/nb1/note', {
      content: {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: img.url } },
          { type: 'paragraph', content: [{ type: 'text', text: 'n1 sin a' }] },
        ],
      },
    });
    const pdf = Buffer.from('%PDF-1.7\n%test\n');
    expect(
      (
        await c.raw('POST', '/api/books', {
          body: pdf,
          headers: { 'X-File-Name': 'Waves.pdf', 'X-Title': 'Waves/../../x', 'X-Page-Count': '3' },
        })
      ).status,
    ).toBe(201);

    const files = await download(c);
    const names = [...files.keys()];
    const data = JSON.parse(new TextDecoder().decode(files.get('data.json'))) as {
      format: string;
      account: Record<string, unknown>;
      subjects: unknown[];
      notebooks: { title: string; pages: { elements: { v?: string }[] }[]; notes: { content: unknown[] } }[];
      books: { title: string; file: string }[];
      decks: { cards: unknown[] }[];
    };
    expect(data.format).toBe('akshar-export');
    expect(data.account).toEqual({
      username: expect.any(String),
      name: 'Asha',
      photo: null,
      createdAt: expect.any(Number),
    });
    expect(data.subjects).toHaveLength(4); // starter content
    expect(data.decks.reduce((sum, d) => sum + d.cards.length, 0)).toBe(13);
    const optics = data.notebooks.find((nb) => nb.title === 'Optics');
    expect(optics?.pages[0]?.elements[0]?.v).toBe('Snell');
    expect(optics?.notes.content).toHaveLength(2);
    // Files: the book under a readable name (no path tricks), the note image under its own name.
    const book = data.books[0];
    expect(book?.file).toMatch(/^files\/books\/Waves \.\. \.\. x \([A-Za-z0-9_-]{6}\)\.pdf$/);
    expect(new TextDecoder().decode(files.get(book?.file ?? ''))).toBe('%PDF-1.7\n%test\n');
    const imageName = img.url.split('/').pop() ?? '';
    expect([...(files.get(`files/images/${imageName}`) ?? [])]).toEqual([...PNG]);
    expect(names).toContain('README.txt');
    // No secrets.
    const raw = new TextDecoder().decode(files.get('data.json'));
    expect(raw).not.toMatch(/password|scrypt|token|session/i);
  });

  it("never includes another user's data and needs a session", async () => {
    const alice = await client().signUp(uname('alice'));
    await alice.json('PUT', '/api/notebooks/secret', { title: 'Alice private', subjectId: null });
    const bob = await client().signUp(uname('bob'));
    const files = await download(bob);
    const raw = new TextDecoder().decode(files.get('data.json'));
    expect(raw).not.toContain('Alice private');
    expect([...files.keys()].filter((k) => k.startsWith('files/'))).toEqual([]);

    expect((await client().raw('GET', '/api/export')).status).toBe(401);
  });
});
