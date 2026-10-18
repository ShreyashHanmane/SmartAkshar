import { describe, expect, it } from 'vitest';
import { type SessionState, guardProtected, guardPublicAuth } from './guards';

const signedIn: SessionState = {
  status: 'signedIn',
  user: { uid: 'u1', username: 'asha', displayName: 'Asha', avatarUrl: null },
};
const signedOut: SessionState = { status: 'signedOut' };
const loading: SessionState = { status: 'loading' };

describe('guardProtected', () => {
  it('waits, redirects signed-out visitors with a return path, and allows users', () => {
    expect(guardProtected(loading, '/')).toEqual({ kind: 'wait' });
    expect(guardProtected(signedOut, '/flashcards?x=1')).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fflashcards%3Fx%3D1',
    });
    expect(guardProtected(signedIn, '/')).toEqual({ kind: 'allow' });
  });
});

describe('guardPublicAuth', () => {
  it('allows signed-out visitors and sends signed-in users on', () => {
    expect(guardPublicAuth(signedOut, '/')).toEqual({ kind: 'allow' });
    expect(guardPublicAuth(signedIn, '/library')).toEqual({ kind: 'redirect', to: '/library' });
    expect(guardPublicAuth(loading, '/')).toEqual({ kind: 'wait' });
  });
});
