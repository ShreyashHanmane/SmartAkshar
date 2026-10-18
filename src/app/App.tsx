import { RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../ui/Toast';
import { AppErrorBoundary } from './AppErrorBoundary';
import { router } from './router';
import { SessionProvider } from './session/SessionProvider';
import { SettingsProvider } from './settings/SettingsProvider';

export function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <SessionProvider>
          <SettingsProvider>
            <RouterProvider router={router} />
          </SettingsProvider>
        </SessionProvider>
      </ToastProvider>
    </AppErrorBoundary>
  );
}
