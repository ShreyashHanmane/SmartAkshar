import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, startServer } from './harness.ts';

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.stop());

let n = 0;
const user = () => new Client(server.base).signUp(`fc${++n}`);
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const json = async <T>(res: Response) => (await res.json()) as T;

describe('decks and cards', () => {
  it('creates decks and cards, counts due cards, and schedules reviews', async () => {
    const c = await user();
    const { id: deck } = await json<{ id: string }>(
      await c.json('POST', '/api/decks', { title: 'Mechanics', subjectId: null }),
    );
    const { id: card } = await json<{ id: string }>(
      await c.json('POST', `/api/decks/${deck}/cards`, { front: 'F?', back: 'ma' }),
    );
    await c.json('POST', `/api/decks/${deck}/cards`, { front: 'p?', back: 'mv' });

    const decks = await json<{ total: number; due: number }[]>(
      await c.json('GET', `/api/decks?before=${endOfToday()}`),
    );
    expect(decks[0]).toMatchObject({ title: 'Mechanics', total: 2, due: 2 });

    const r = await json<{ box: number; due: number }>(
      await c.json('POST', `/api/cards/${card}/review`, { result: 'know' }),
    );
    expect(r.box).toBe(2);
    expect(r.due).toBeGreaterThan(endOfToday());
    const due = await json<{ id: string }[]>(await c.json('GET', `/api/cards/due?before=${endOfToday()}`));
    expect(due.map((d) => d.id)).not.toContain(card);

    const again = await json<{ box: number }>(
      await c.json('POST', `/api/cards/${card}/review`, { result: 'again' }),
    );
    expect(again.box).toBe(1);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const stats = await json<{ total: number; reviewedToday: number; boxes: number[] }>(
      await c.json('GET', `/api/flashcards/stats?before=${endOfToday()}&since=${start.getTime()}`),
    );
    expect(stats).toMatchObject({ total: 2, reviewedToday: 1, boxes: [2, 0, 0, 0, 0] });
  });

  it('edits, moves, and deletes cards; deleting a deck removes its cards', async () => {
    const c = await user();
    const { id: a } = await json<{ id: string }>(
      await c.json('POST', '/api/decks', { title: 'A', subjectId: null }),
    );
    const { id: b } = await json<{ id: string }>(
      await c.json('POST', '/api/decks', { title: 'B', subjectId: null }),
    );
    const { id: card } = await json<{ id: string }>(
      await c.json('POST', `/api/decks/${a}/cards`, { front: 'q', back: 'a' }),
    );
    expect((await c.json('PATCH', `/api/cards/${card}`, { back: 'answer', deckId: b })).status).toBe(204);
    expect(await json(await c.json('GET', `/api/decks/${b}/cards`))).toMatchObject([
      { id: card, back: 'answer' },
    ]);
    expect((await c.json('DELETE', `/api/decks/${b}`)).status).toBe(204);
    expect((await c.json('PATCH', `/api/cards/${card}`, { back: 'x' })).status).toBe(404);
  });

  it('validates input', async () => {
    const c = await user();
    const { id: deck } = await json<{ id: string }>(
      await c.json('POST', '/api/decks', { title: 'D', subjectId: null }),
    );
    expect((await c.json('POST', '/api/decks', { title: '', subjectId: null })).status).toBe(400);
    expect((await c.json('POST', `/api/decks/${deck}/cards`, { front: ' ', back: 'x' })).status).toBe(400);
    expect(
      (await c.json('POST', `/api/decks/${deck}/cards`, { front: 'x'.repeat(2001), back: 'x' })).status,
    ).toBe(400);
    expect((await c.json('POST', `/api/decks/${deck}/cards`, { front: 'q', back: 'a', box: 5 })).status).toBe(
      400,
    );
    const { id: card } = await json<{ id: string }>(
      await c.json('POST', `/api/decks/${deck}/cards`, { front: 'q', back: 'a' }),
    );
    expect((await c.json('POST', `/api/cards/${card}/review`, { result: 'perfect' })).status).toBe(400);
    expect((await c.json('GET', `/api/cards/due?before=${Date.now() + 10 * 86_400_000}`)).status).toBe(400);
  });

  it("keeps each student's decks and cards private", async () => {
    const alice = await user();
    const bob = await user();
    const { id: deck } = await json<{ id: string }>(
      await alice.json('POST', '/api/decks', { title: 'Secret', subjectId: null }),
    );
    const { id: card } = await json<{ id: string }>(
      await alice.json('POST', `/api/decks/${deck}/cards`, { front: 'q', back: 'a' }),
    );
    expect(await json(await bob.json('GET', `/api/decks?before=${endOfToday()}`))).toEqual([]);
    expect(await json(await bob.json('GET', `/api/cards/due?before=${endOfToday()}`))).toEqual([]);
    for (const [m, p, body] of [
      ['GET', `/api/decks/${deck}/cards`],
      ['POST', `/api/decks/${deck}/cards`, { front: 'x', back: 'y' }],
      ['PATCH', `/api/decks/${deck}`, { title: 'mine' }],
      ['PATCH', `/api/cards/${card}`, { back: 'y' }],
      ['POST', `/api/cards/${card}/review`, { result: 'know' }],
      ['DELETE', `/api/cards/${card}`],
    ] as const)
      expect((await bob.json(m, p, body)).status, `${m} ${p}`).toBe(404);
    expect(await json(await alice.json('GET', `/api/decks/${deck}/cards`))).toHaveLength(1);
  });

  it('deleting a subject keeps its decks (as "No subject")', async () => {
    const c = await user();
    const { id: subject } = await json<{ id: string }>(
      await c.json('POST', '/api/subjects', { name: 'Physics', color: 'blue' }),
    );
    await c.json('POST', '/api/decks', { title: 'Waves', subjectId: subject });
    await c.json('DELETE', `/api/subjects/${subject}`);
    expect(await json(await c.json('GET', `/api/decks?before=${endOfToday()}`))).toMatchObject([
      { title: 'Waves', subjectId: null },
    ]);
  });
});
