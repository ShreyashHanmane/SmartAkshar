import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FullPageLoader } from '../../ui/FullPageLoader';
import { ServerDown } from '../../ui/ServerDown';
import { useServerReachable } from '../../ui/useOnline';
import { type GuardResult, guardProtected, guardPublicAuth } from './guards';
import { safeNextPath } from './redirect';
import { useSession } from './SessionProvider';

function Render({ result, children }: { result: GuardResult; children: ReactNode }) {
  const reachable = useServerReachable();
  // Can't even check the session: the local server isn't running.
  if (result.kind === 'wait') return reachable ? <FullPageLoader /> : <ServerDown />;
  if (result.kind === 'redirect') return <Navigate to={result.to} replace />;
  return <>{children}</>;
}

export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  return (
    <Render result={guardProtected(session, `${location.pathname}${location.search}`)}>{children}</Render>
  );
}

export function useNextPath(): string {
  const [params] = useSearchParams();
  return safeNextPath(params.get('next'));
}

export function PublicAuthOnly({ children }: { children: ReactNode }) {
  return <Render result={guardPublicAuth(useSession(), useNextPath())}>{children}</Render>;
}
