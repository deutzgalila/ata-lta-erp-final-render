import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouteGuard } from '@/components/auth/RouteGuard';
import AdminPage from '@/routes/admin';
import { useSessionStore } from '@/lib/session';

function createHarness(initialEntries = ['/admin']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const AppWithRouting = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RouteGuard requiredPermission="users:manage">
                <Suspense fallback={<div>Loading route...</div>}>
                  <AdminPage />
                </Suspense>
              </RouteGuard>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard Screen</div>} />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { queryClient, AppWithRouting };
}

describe('Admin RBAC & RouteGuard Security (/admin)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/users')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      }
      if (u.includes('/operations/templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      }
      if (u.includes('/admin/audit')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders <Forbidden /> screen with data-testid="forbidden-screen" when user lacks users:manage (e.g. dev-accs@ata-lta.ph)', async () => {
    // Authenticate as Accounting staff (lacks users:manage)
    useSessionStore.getState().setSession({
      user: {
        id: 'user-accs',
        email: 'dev-accs@ata-lta.ph',
        name: 'Accounting Staff',
        role: 'Accounting',
        departments: ['Accounting'],
        entities: ['ATA'],
      },
      permissions: ['billing:view', 'billing:edit', 'disbursement:view'],
      activeEntity: 'ATA',
    });

    const { AppWithRouting } = createHarness();
    render(<AppWithRouting />);

    await waitFor(() => {
      expect(screen.getByTestId('forbidden-screen')).toBeInTheDocument();
    });

    expect(screen.getByText('Access Forbidden')).toBeInTheDocument();
    expect(screen.getByText('users:manage')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
  });

  it('renders <Forbidden /> screen when authenticated as Manager (dev-docs@ata-lta.ph) who only has users:view', async () => {
    // Manager has users:view, but strictly lacks users:manage
    useSessionStore.getState().setSession({
      user: {
        id: 'user-docs',
        email: 'dev-docs@ata-lta.ph',
        name: 'Documentation Manager',
        role: 'Manager',
        departments: ['Management', 'Documentation'],
        entities: ['ATA', 'LTA'],
      },
      permissions: ['users:view', 'retainers:use', 'workflow:view', 'workflow:edit'],
      activeEntity: 'ALL',
    });

    const { AppWithRouting } = createHarness();
    render(<AppWithRouting />);

    await waitFor(() => {
      expect(screen.getByTestId('forbidden-screen')).toBeInTheDocument();
    });

    expect(screen.getByText('users:manage')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
  });

  it('renders Admin page and tabs when authenticated as Administrator (dev-admin@ata-lta.ph)', async () => {
    // Admin has users:manage and retainers:edit
    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'dev-admin@ata-lta.ph',
        name: 'Admin Developer',
        role: 'Admin',
        departments: ['Management', 'Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'users:view',
        'users:manage',
        'retainers:use',
        'retainers:edit',
        'workflow:view',
      ],
      activeEntity: 'ALL',
    });

    const { AppWithRouting } = createHarness();
    render(<AppWithRouting />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-page')).toBeInTheDocument();
      expect(screen.getByTestId('admin-tabs-container')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('forbidden-screen')).not.toBeInTheDocument();
    expect(screen.getByText('Enterprise Administration')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-users')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-permissions')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-retainers')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trigger-generations')).toBeInTheDocument();
  });
});
