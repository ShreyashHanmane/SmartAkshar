import { createBrowserRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';
import { PublicAuthOnly, RequireSession, VerifyOnly } from './session/Guards';

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
        path: '/',
        element: (
          <RequireSession>
            <HomePage />
          </RequireSession>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
