import { z } from 'zod';
import { endOfDay, startOfDay, type ReviewResult } from '../shared/leitner';
import { type Card, type Deck, type FlashcardStats, cardSchema, deckSchema, statsSchema } from '../shared/schemas';
import { getJson, send } from './api';
import { live } from './events';

export type { Card, Deck, FlashcardStats };
const enc = encodeURIComponent;
const today = () => endOfDay(new Date());

export function subscribeDecks(next: (d: Deck[]) => void, fail: (e: unknown) => void) {
  return live(() => getJson(`/api/decks?before=${today()}`, z.array(deckSchema)), ['decks'], next, fail);
}

export async function createDeck(title: string, subjectId: string | null): Promise<string> {
  return ((await send('POST', '/api/decks', { title: title.trim().slice(0, 120), subjectId })) as { id: string }).id;
}

export async function updateDeck(id: string, patch: { title?: string; subjectId?: string | null }) {
  await send('PATCH', `/api/decks/${enc(id)}`, patch);
}

export async function deleteDeck(id: string) {
  await send('DELETE', `/api/decks/${enc(id)}`);
}

export function subscribeCards(deckId: string, next: (c: Card[]) => void, fail: (e: unknown) => void) {
  return live(() => getJson(`/api/decks/${enc(deckId)}/cards`, z.array(cardSchema)), [`cards:${deckId}`], next, fail);
}

export async function createCard(deckId: string, front: string, back: string): Promise<string> {
  return ((await send('POST', `/api/decks/${enc(deckId)}/cards`, { front: front.trim(), back: back.trim() })) as { id: string }).id;
}

export async function updateCard(id: string, patch: { front?: string; back?: string; deckId?: string }) {
  await send('PATCH', `/api/cards/${enc(id)}`, patch);
}

export async function deleteCard(id: string) {
  await send('DELETE', `/api/cards/${enc(id)}`);
}

export async function reviewCard(id: string, result: ReviewResult) {
  await send('POST', `/api/cards/${enc(id)}/review`, { result });
}

/** Cards due by the end of today (one deck, or all decks). */
export function loadDueCards(deckId?: string): Promise<Card[]> {
  return getJson(`/api/cards/due?before=${today()}${deckId ? `&deck=${enc(deckId)}` : ''}`, z.array(cardSchema));
}

export function loadCards(deckId: string): Promise<Card[]> {
  return getJson(`/api/decks/${enc(deckId)}/cards`, z.array(cardSchema));
}

export function subscribeStats(next: (s: FlashcardStats) => void, fail: (e: unknown) => void) {
  return live(
    () => getJson(`/api/flashcards/stats?before=${today()}&since=${startOfDay(new Date())}`, statsSchema),
    ['cards', 'decks'],
    next,
    fail,
  );
}
