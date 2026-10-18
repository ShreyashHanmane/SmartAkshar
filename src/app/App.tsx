import { RouterProvider } from 'react-router-dom';
import { AppErrorBoundary } from './AppErrorBoundary';
import { router } from './router';
import { SessionProvider } from './session/SessionProvider';

export function App() {
  return (
    <AppErrorBoundary>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </AppErrorBoundary>
  );
}
