import type { SessionUser } from '../../data/auth';

export type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };

export type GuardResult = { kind: 'wait' } | { kind: 'allow' } | { kind: 'redirect'; to: string };

/** Routes that require a session (the app itself). */
export function guardProtected(session: SessionState, here: string): GuardResult {
  if (session.status === 'loading') return { kind: 'wait' };
  if (session.status === 'signedOut')
    return { kind: 'redirect', to: `/login?next=${encodeURIComponent(here)}` };
  return { kind: 'allow' };
}

/** Sign-in and sign-up pages: signed-in people go on to the app. */
export function guardPublicAuth(session: SessionState, next: string): GuardResult {
  if (session.status === 'loading') return { kind: 'wait' };
  if (session.status === 'signedOut') return { kind: 'allow' };
  return { kind: 'redirect', to: next };
}
