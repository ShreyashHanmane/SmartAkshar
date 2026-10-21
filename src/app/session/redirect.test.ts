import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/flashcards?deck=1')).toBe('/flashcards?deck=1');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/ok\\..',
    '/x\u0000y',
    '/login',
    '/login#hash',
    '/signup#hash',
    '/LOGIN',
    '/Login?next=/',
    '/signup?next=/',
    '/auth/login',
    '/(auth)/login',
    `/${'a'.repeat(600)}`,
  ])('rejects %j', (input) => {
    expect(safeNextPath(input)).toBe('/');
  });
});
