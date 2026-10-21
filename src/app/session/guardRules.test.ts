import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../../data/auth';
import { type SessionState, guardProtected, guardPublicAuth, guardVerify } from './guardRules';

const base: SessionUser = {
  uid: 'u1',
  email: 'a@b.co',
  displayName: 'Asha',
  photoURL: null,
  isGuest: false,
  emailVerified: true,
  needsVerification: false,
  providers: ['password'],
  username: 'asha',
  avatarUrl: null,
};
const signedIn = (patch: Partial<SessionUser> = {}): SessionState => ({
  status: 'signedIn',
  user: { ...base, ...patch },
});
const signedOut: SessionState = { status: 'signedOut' };
const loading: SessionState = { status: 'loading' };

describe('guardProtected', () => {
  it('waits while the session loads', () => expect(guardProtected(loading, '/')).toEqual({ kind: 'wait' }));
  it('sends signed-out people to login with a return path', () =>
    expect(guardProtected(signedOut, '/flashcards?x=1')).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fflashcards%3Fx%3D1',
    }));
  it('sends unverified password users to verify', () =>
    expect(guardProtected(signedIn({ needsVerification: true }), '/')).toEqual({
      kind: 'redirect',
      to: '/verify-email',
    }));
  it('allows verified users and guests', () => {
    expect(guardProtected(signedIn(), '/')).toEqual({ kind: 'allow' });
    expect(guardProtected(signedIn({ isGuest: true, email: null }), '/')).toEqual({ kind: 'allow' });
  });
});

describe('guardPublicAuth', () => {
  it('allows signed-out people and guests', () => {
    expect(guardPublicAuth(signedOut, '/')).toEqual({ kind: 'allow' });
    expect(guardPublicAuth(signedIn({ isGuest: true }), '/')).toEqual({ kind: 'allow' });
  });
  it('sends signed-in users on to their destination', () =>
    expect(guardPublicAuth(signedIn(), '/library')).toEqual({ kind: 'redirect', to: '/library' }));
  it('sends unverified users to verify', () =>
    expect(guardPublicAuth(signedIn({ needsVerification: true }), '/')).toEqual({
      kind: 'redirect',
      to: '/verify-email',
    }));
});

describe('guardVerify', () => {
  it('only allows users who need verification', () => {
    expect(guardVerify(signedIn({ needsVerification: true }))).toEqual({ kind: 'allow' });
    expect(guardVerify(signedIn())).toEqual({ kind: 'redirect', to: '/' });
    expect(guardVerify(signedOut)).toEqual({ kind: 'redirect', to: '/login' });
  });
});
