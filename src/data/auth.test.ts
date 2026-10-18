import type { User } from 'firebase/auth';
import { describe, expect, it } from 'vitest';
import { authErrorCode, toSessionUser } from './auth';

const user = (patch: Partial<User> & { providers?: string[] }): User =>
  ({
    uid: 'u',
    email: 'a@b.co',
    displayName: null,
    photoURL: null,
    isAnonymous: false,
    emailVerified: false,
    providerData: (patch.providers ?? ['password']).map((providerId) => ({ providerId })),
    ...patch,
  }) as unknown as User;

describe('toSessionUser', () => {
  it('flags unverified password accounts', () => {
    expect(toSessionUser(user({})).needsVerification).toBe(true);
    expect(toSessionUser(user({ emailVerified: true })).needsVerification).toBe(false);
  });
  it('never asks Google or guest users to verify', () => {
    expect(toSessionUser(user({ providers: ['google.com'] })).needsVerification).toBe(false);
    expect(toSessionUser(user({ isAnonymous: true, providers: [] })).needsVerification).toBe(false);
    expect(toSessionUser(user({ isAnonymous: true, providers: [] })).isGuest).toBe(true);
  });
  it('does not require verification when Google is linked alongside a password', () => {
    expect(toSessionUser(user({ providers: ['password', 'google.com'] })).needsVerification).toBe(false);
  });
});

describe('authErrorCode', () => {
  it('reads string codes only', () => {
    expect(authErrorCode({ code: 'auth/x' })).toBe('auth/x');
    expect(authErrorCode({ code: 5 })).toBeUndefined();
    expect(authErrorCode('oops')).toBeUndefined();
  });
});
