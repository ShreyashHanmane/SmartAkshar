import { createBrowserRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { HomePage } from '../features/home/HomePage';
import { SearchPage } from '../features/search/SearchPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';
import { PublicAuthOnly, RequireSession, VerifyOnly } from './session/Guards';
import { AppShell } from './shell/AppShell';
import { ComingSoonPage } from './shell/ComingSoonPage';

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/login',
        element: (
          <PublicAuthOnly>
            <LoginPage />
          </PublicAuthOnly>
        ),
      },
      {
        path: '/signup',
        element: (
          <PublicAuthOnly signUp>
            <SignUpPage />
          </PublicAuthOnly>
        ),
      },
      {
        path: '/forgot-password',
        element: (
          <PublicAuthOnly>
            <ForgotPasswordPage />
          </PublicAuthOnly>
        ),
      },
      {
        path: '/verify-email',
        element: (
          <VerifyOnly>
            <VerifyEmailPage />
          </VerifyOnly>
        ),
      },
      {
        element: (
          <RequireSession>
            <AppShell />
          </RequireSession>
        ),
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/notebooks', element: <ComingSoonPage title="nav.whiteboard" /> },
          { path: '/flashcards', element: <ComingSoonPage title="nav.flashcards" /> },
          { path: '/library', element: <ComingSoonPage title="nav.library" /> },
          { path: '/search', element: <SearchPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
