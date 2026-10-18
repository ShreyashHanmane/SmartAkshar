import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotebooksPage } from '../features/notebooks/NotebooksPage';
import { SearchPage } from '../features/search/SearchPage';
import { DeckPage } from '../features/flashcards/DeckPage';
import { FlashcardsPage } from '../features/flashcards/FlashcardsPage';
import { QuizPage } from '../features/flashcards/QuizPage';
import { ReviewPage } from '../features/flashcards/ReviewPage';
import { LibraryPage } from '../features/library/LibraryPage';
import { ReaderPage } from '../features/reader/ReaderPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { WhiteboardPage } from '../features/whiteboard/WhiteboardPage';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';
import { PublicAuthOnly, RequireSession } from './session/Guards';
import { AppShell } from './shell/AppShell';

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
          { path: '/flashcards', element: <FlashcardsPage /> },
          { path: '/flashcards/review', element: <ReviewPage /> },
          { path: '/flashcards/:deckId', element: <DeckPage /> },
          { path: '/flashcards/:deckId/quiz', element: <QuizPage /> },
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
