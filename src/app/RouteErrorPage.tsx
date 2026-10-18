import { useRouteError } from 'react-router-dom';
import { ErrorScreen } from './ErrorScreen';

export function RouteErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return <ErrorScreen />;
}
