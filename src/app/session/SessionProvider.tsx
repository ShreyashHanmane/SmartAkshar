import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { observeSession, watchAccount } from '../../data/auth';
import type { SessionState } from './guardRules';

const SessionContext = createContext<SessionState>({ status: 'loading' });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(
    () => observeSession((user) => setSession(user ? { status: 'signedIn', user } : { status: 'signedOut' })),
    [],
  );

  const signedInUid = session.status === 'signedIn' ? session.user.uid : null;
  useEffect(() => (signedInUid ? watchAccount() : undefined), [signedInUid]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** For screens inside a protected route, where a user is guaranteed. */
export function useSignedInUser() {
  const session = useSession();
  if (session.status !== 'signedIn') throw new Error('useSignedInUser used outside a protected route');
  return session.user;
}
