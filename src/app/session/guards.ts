import type { SessionUser } from '../../data/auth';

export type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };

export type GuardResult = { kind: 'wait' } | { kind: 'allow' } | { kind: 'redirect'; to: string };

/** Routes that require a session (the app itself). */
export function guardProtected(session: SessionState, here: string): GuardResult {
  if (session.status === 'loading') return { kind: 'wait' };
  if (session.status === 'signedOut')
    return { kind: 'redirect', to: `/login?next=${encodeURIComponent(here)}` };
  if (session.user.needsVerification) return { kind: 'redirect', to: '/verify-email' };
  return { kind: 'allow' };
}

/**
 * Sign-in / forgot-password pages. Fully signed-in people go to the app.
 * Guests may open them (to sign in to an existing account).
 */
export function guardPublicAuth(session: SessionState, next: string): GuardResult {
  if (session.status === 'loading') return { kind: 'wait' };
  if (session.status === 'signedOut') return { kind: 'allow' };
  if (session.user.isGuest) return { kind: 'allow' };
  if (session.user.needsVerification) return { kind: 'redirect', to: '/verify-email' };
  return { kind: 'redirect', to: next };
}

/** Sign-up page: open to signed-out people and to guests (who upgrade in place). */
export function guardSignUp(session: SessionState, next: string): GuardResult {
  return guardPublicAuth(session, next);
}

/** Verify-email page: only for password accounts that still need verification. */
export function guardVerify(session: SessionState): GuardResult {
  if (session.status === 'loading') return { kind: 'wait' };
  if (session.status === 'signedOut') return { kind: 'redirect', to: '/login' };
  if (!session.user.needsVerification) return { kind: 'redirect', to: '/' };
  return { kind: 'allow' };
}
