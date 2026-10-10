import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { ApiError } from './lib/api';
import Layout from './components/Layout';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import { EmptyState, LoadingBlock } from './components/ui';
import type { UserRole } from './lib/types';

/*
 * The 3D explorer pulls in three.js and the r3f stack. Loading it lazily keeps
 * that weight off every other route, including the login screen.
 */
const ExplorerPage = lazy(() => import('./features/explorer/ExplorerPage'));
const MyRoomPage = lazy(() => import('./features/myroom/MyRoomPage'));
const RequestsPage = lazy(() => import('./features/requests/RequestsPage'));
const GatepassPage = lazy(() => import('./features/gatepass/GatepassPage'));
const VerifyPage = lazy(() => import('./features/gatepass/VerifyPage'));
const ElectricityPage = lazy(() => import('./features/electricity/ElectricityPage'));
const AnnouncementsPage = lazy(() => import('./features/announcements/AnnouncementsPage'));
const MessPage = lazy(() => import('./features/mess/MessPage'));
const RaidsPage = lazy(() => import('./features/raids/RaidsPage'));
const AllocatePage = lazy(() => import('./features/allocate/AllocatePage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 4xx just repeats the same rejection; only transient
        // failures are worth a second attempt.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingBlock label="Signing you in…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Client-side mirror of the server's RBAC matrix. The server remains authoritative. */
function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    return (
      <EmptyState
        title="Not available for your role"
        description="Your account does not have access to this area."
      />
    );
  }
  return <>{children}</>;
}

const STAFF_VIEW: UserRole[] = ['WARDEN', 'SUPERVISOR', 'ADMIN'];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<LoadingBlock />}>
                    <DashboardPage />
                  </Suspense>
                }
              />
              <Route
                path="explorer"
                element={
                  <RequireRole roles={['STUDENT', ...STAFF_VIEW]}>
                    <Suspense fallback={<LoadingBlock label="Loading the 3D explorer…" />}>
                      <ExplorerPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="my-room"
                element={
                  <RequireRole roles={['STUDENT']}>
                    <Suspense fallback={<LoadingBlock />}>
                      <MyRoomPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="requests"
                element={
                  <RequireRole roles={['STUDENT', ...STAFF_VIEW]}>
                    <Suspense fallback={<LoadingBlock />}>
                      <RequestsPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="gatepass"
                element={
                  <RequireRole roles={['STUDENT', 'WARDEN', 'ADMIN']}>
                    <Suspense fallback={<LoadingBlock />}>
                      <GatepassPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="verify"
                element={
                  <RequireRole roles={['SECURITY', 'ADMIN']}>
                    <Suspense fallback={<LoadingBlock />}>
                      <VerifyPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="electricity"
                element={
                  <RequireRole roles={['STUDENT', ...STAFF_VIEW]}>
                    <Suspense fallback={<LoadingBlock />}>
                      <ElectricityPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="announcements"
                element={
                  <Suspense fallback={<LoadingBlock />}>
                    <AnnouncementsPage />
                  </Suspense>
                }
              />
              <Route
                path="mess"
                element={
                  <RequireRole roles={['STUDENT', 'MESS_STAFF', ...STAFF_VIEW]}>
                    <Suspense fallback={<LoadingBlock />}>
                      <MessPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="raids"
                element={
                  <RequireRole roles={STAFF_VIEW}>
                    <Suspense fallback={<LoadingBlock />}>
                      <RaidsPage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="allocate"
                element={
                  <RequireRole roles={STAFF_VIEW}>
                    <Suspense fallback={<LoadingBlock />}>
                      <AllocatePage />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="*"
                element={
                  <EmptyState
                    title="Page not found"
                    description="The page you were looking for does not exist."
                  />
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
