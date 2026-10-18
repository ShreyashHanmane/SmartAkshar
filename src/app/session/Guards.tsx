import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FullPageLoader } from '../../ui/FullPageLoader';
import { type GuardResult, guardProtected, guardPublicAuth, guardSignUp, guardVerify } from './guards';
import { safeNextPath } from './redirect';
import { useSession } from './SessionProvider';

function Render({ result, children }: { result: GuardResult; children: ReactNode }) {
  if (result.kind === 'wait') return <FullPageLoader />;
  if (result.kind === 'redirect') return <Navigate to={result.to} replace />;
  return <>{children}</>;
}

export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;
  return <Render result={guardProtected(session, here)}>{children}</Render>;
}

export function useNextPath(): string {
  const [params] = useSearchParams();
  return safeNextPath(params.get('next'));
}

export function PublicAuthOnly({ children, signUp = false }: { children: ReactNode; signUp?: boolean }) {
  const session = useSession();
  const next = useNextPath();
  const result = signUp ? guardSignUp(session, next) : guardPublicAuth(session, next);
  return <Render result={result}>{children}</Render>;
}

export function VerifyOnly({ children }: { children: ReactNode }) {
  return <Render result={guardVerify(useSession())}>{children}</Render>;
}
