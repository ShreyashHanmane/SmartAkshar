import { createBrowserRouter } from 'react-router-dom';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage />, errorElement: <RouteErrorPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
