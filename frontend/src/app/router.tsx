import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { PublicLayout } from '../components/layout/PublicLayout';
import { ConfirmationPage } from '../features/confirmation/ConfirmationPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotFoundPage } from '../features/NotFoundPage';
import { BookingPage } from '../features/public-booking/BookingPage';

export const routes: RouteObject[] = [
  // The dashboard is the landing page; visitors reach /book and the confirmation page directly.
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  {
    element: <PublicLayout />,
    children: [
      { path: '/book', element: <BookingPage /> },
      { path: '/booking/confirmation/:token', element: <ConfirmationPage /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [{ path: '/dashboard', element: <DashboardPage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
