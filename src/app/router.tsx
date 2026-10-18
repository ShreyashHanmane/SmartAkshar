import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotebooksPage } from '../features/notebooks/NotebooksPage';
import { SearchPage } from '../features/search/SearchPage';
import { LibraryPage } from '../features/library/LibraryPage';
import { ReaderPage } from '../features/reader/ReaderPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { WhiteboardPage } from '../features/whiteboard/WhiteboardPage';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';
import { PublicAuthOnly, RequireSession } from './session/Guards';
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
          <PublicAuthOnly>
            <SignUpPage />
          </PublicAuthOnly>
        ),
      },
      {
        element: (
          <RequireSession>
            <AppShell />
          </RequireSession>
        ),
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/notebooks', element: <NotebooksPage /> },
          { path: '/flashcards', element: <ComingSoonPage title="nav.flashcards" /> },
          { path: '/library', element: <LibraryPage /> },
          { path: '/search', element: <SearchPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      {
        path: '/notebooks/:notebookId',
        element: (
          <RequireSession>
            <WhiteboardPage />
          </RequireSession>
        ),
      },
      {
        path: '/library/:bookId',
        element: (
          <RequireSession>
            <ReaderPage />
          </RequireSession>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
