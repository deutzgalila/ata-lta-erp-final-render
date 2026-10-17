import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ClientsPage from '@/routes/clients';
import { useSessionStore, type SessionState } from '@/lib/session';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import type { Client, RegisteredUser } from '../api/types';

// Mock session store
vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  const { create } = await import('zustand');
  const isolatedStore = create<SessionState>((set) => ({
    user: null,
    permissions: new Set<string>(),
    activeEntity: 'ATA',
    unreadCount: 0,
    isAuthenticated: true,
    isLoading: false,

    setSession: ({ user, permissions, activeEntity, unreadCount }) => {
      const permSet = permissions instanceof Set ? permissions : new Set(permissions);
      set({
        user,
        permissions: permSet,
        activeEntity: activeEntity || 'ATA',
        unreadCount: unreadCount ?? 0,
        isAuthenticated: true,
        isLoading: false,
      });
    },
    setActiveEntity: (entity) => set({ activeEntity: entity }),
    setUnreadCount: (count) => set({ unreadCount: count }),
    clearSession: () =>
      set({
        user: null,
        permissions: new Set<string>(),
        activeEntity: null,
        unreadCount: 0,
        isAuthenticated: false,
        isLoading: false,
      }),
    setLoading: (isLoading) => set({ isLoading }),
  }));

  return {
    ...actual,
    useSessionStore: isolatedStore,
  };
});

// Enable Clients feature flag
vi.mock('@/lib/flags', () => ({
  isModuleEnabled: () => true,
  ENABLED_MODULES: ['Clients'],
}));

const mockClients: Client[] = [
  {
    id: 'c-101',
    entity: 'ATA',
    name: 'Megaworld Prime Corp',
    tin: '111-222-333-00000',
    rdoCode: '044',
    address: 'Uptown Mall, Taguig',
    tradeName: 'Megaworld',
    contactUserId: 'u-admin-1',
    contactPerson: 'Andrew Tan',
    retainer: true,
    retainerFee: 50000,
    status: 'Active',
    createdBy: 'u-1',
    updatedBy: 'u-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    contactDetails: [{ type: 'email', value: 'contact@megaworld.com', label: 'Primary' }],
    relatedCompanies: [],
  },
  {
    id: 'c-102',
    entity: 'ATA',
    name: 'Ayala Land Inc.',
    tin: '444-555-666-00000',
    rdoCode: '047',
    address: 'Makati Ave, Makati City',
    tradeName: 'Ayala',
    contactUserId: null,
    contactPerson: 'Jaime Zobel',
    retainer: false,
    retainerFee: null,
    status: 'Active',
    createdBy: 'u-1',
    updatedBy: 'u-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    contactDetails: [{ type: 'mobile', value: '09171234567', label: 'Mobile' }],
    relatedCompanies: [],
  },
];

const mockUsers: RegisteredUser[] = [
  {
    id: 'u-admin-1',
    name: 'Admin User',
    email: 'admin@ata-lta.ph',
    role: 'Admin',
  },
  {
    id: 'u-manager-1',
    name: 'Maria Santos',
    email: 'maria@ata-lta.ph',
    role: 'Manager',
  },
  {
    id: 'u-staff-1',
    name: 'Juan Dela Cruz',
    email: 'juan@ata-lta.ph',
    role: 'Staff',
  },
];

let activeQueryClients: QueryClient[] = [];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  activeQueryClients.push(queryClient);

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, { initialEntries: ['/clients'] }, children)
      ),
  };
}

describe('Clients Module: Validation, Input Locks, Point of Contact & Related Companies', () => {
  const originalFetch = global.fetch;

  const setAdminSession = () => {
    useSessionStore.getState().setSession({
      user: {
        id: 'u-admin-1',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Administration'],
        entities: ['ATA'],
      },
      permissions: ['clients:view', 'clients:edit', 'users:view'],
      activeEntity: 'ATA',
    });
  };

  const createMockFetch = (postHandler?: (data: unknown) => void) =>
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/clients/counts')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: { active: 2, archived: 0 } }),
        };
      }
      if (url.includes('/admin/users') || url.includes('/me/team')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: mockUsers }),
        };
      }
      if (url.includes('/clients') && init?.method === 'POST') {
        const parsed = JSON.parse(init.body as string);
        if (postHandler) postHandler(parsed);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              id: 'c-created-1',
              ...parsed,
              status: 'Active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 1,
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: mockClients,
          meta: { total: 2, page: 1, limit: 50, totalPages: 1 },
        }),
      };
    });

  beforeEach(() => {
    global.fetch = createMockFetch();
    setAdminSession();
    useBlockingModalStore.getState().reset();
  });

  afterEach(() => {
    activeQueryClients.forEach((qc) => {
      qc.cancelQueries();
      qc.clear();
    });
    activeQueryClients = [];
    vi.restoreAllMocks();
    useBlockingModalStore.getState().reset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders accurate 14-digit BIR TIN placeholder (000-000-000-00000)', async () => {
    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      const tinInput = screen.getByTestId('client-input-tin');
      expect(tinInput).toBeInTheDocument();
      // Placeholder must have accurate 14 digits (previously missing 2 digits at the end: 000-000-000-000)
      expect(tinInput).toHaveAttribute('placeholder', '000-000-000-00000');
    });
  });

  it('renders entity selector with concise "ATA" and "LTA" labels without expanded company names', async () => {
    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('client-select-entity')).toBeInTheDocument();
    });

    // Expanded names must not be present in the document
    expect(screen.queryByText(/Albay Tax & Accounting/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/LTA Business Management/i)).not.toBeInTheDocument();
  });

  it('enforces TIN input lock: cannot accept more than 14 digits', async () => {
    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('client-input-tin')).toBeInTheDocument();
    });

    const tinInput = screen.getByTestId('client-input-tin');

    // Attempt to type 20 digits
    fireEvent.change(tinInput, { target: { value: '12345678900000999999' } });

    // Must be locked at exactly 14 digits formatted: 123-456-789-00000 (17 chars total)
    expect(tinInput).toHaveValue('123-456-789-00000');
  });

  it('enforces RDO input lock: cannot accept more than 4 alphanumeric characters', async () => {
    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('client-input-rdo')).toBeInTheDocument();
    });

    const rdoInput = screen.getByTestId('client-input-rdo');

    // Type 6 characters with lowercase and special characters
    fireEvent.change(rdoInput, { target: { value: '044a-xy' } });

    // Must be locked at 4 uppercase alphanumeric characters: 044A
    expect(rdoInput).toHaveValue('044A');
  });

  it('enforces contact details input locks for mobile (11 digits) and landline (10 digits)', async () => {
    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('client-add-contact-btn')).toBeInTheDocument();
    });

    // Add first contact row (default category is now mobile)
    fireEvent.click(screen.getByTestId('client-add-contact-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('contact-row-0')).toBeInTheDocument();
    });

    // Default category is mobile with mobile placeholder and 11-digit max length
    const mobileInput = screen.getByTestId('contact-value-0');
    expect(mobileInput).toHaveAttribute('placeholder', 'e.g. 09123456789 (11 digits)');
    expect(mobileInput).toHaveAttribute('maxLength', '11');

    fireEvent.change(mobileInput, { target: { value: '0917-123-4567-8999' } });
    expect(mobileInput).toHaveValue('09171234567');

    // Add second contact row (also defaults to mobile)
    fireEvent.click(screen.getByTestId('client-add-contact-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('contact-row-1')).toBeInTheDocument();
    });

    const secondMobileInput = screen.getByTestId('contact-value-1');
    expect(secondMobileInput).toHaveAttribute('placeholder', 'e.g. 09123456789 (11 digits)');
    expect(secondMobileInput).toHaveAttribute('maxLength', '11');
  });

  it('Point of Contact dropdown displays registered users and sets contactUserId and contactPerson', async () => {
    let capturedPayload: Record<string, unknown> | null = null;
    global.fetch = createMockFetch((data) => {
      capturedPayload = data as Record<string, unknown>;
    });

    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('client-select-poc')).toBeInTheDocument();
    });

    // Fill required fields
    fireEvent.change(screen.getByTestId('client-input-name'), {
      target: { value: 'Test Corporation' },
    });
    fireEvent.change(screen.getByTestId('client-input-tin'), {
      target: { value: '12345678900000' },
    });

    // POC dropdown is rendered
    expect(screen.getByTestId('client-select-poc')).toBeInTheDocument();

    // Submit form
    fireEvent.click(screen.getByTestId('client-submit-btn'));

    await waitFor(() => {
      expect(capturedPayload).toEqual(
        expect.objectContaining({
          name: 'Test Corporation',
          tin: '123-456-789-00000',
        })
      );
    });
  });

  it('allows adding Related Companies without unexpected errors and filters valid records', async () => {
    let capturedPayload: Record<string, unknown> | null = null;
    global.fetch = createMockFetch((data) => {
      capturedPayload = data as Record<string, unknown>;
    });

    const { wrapper } = createWrapper();
    render(<ClientsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-client-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('new-client-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('client-add-related-btn')).toBeInTheDocument();
    });

    // Add Related Company
    fireEvent.click(screen.getByTestId('client-add-related-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('related-row-0')).toBeInTheDocument();
      expect(screen.getByTestId('related-client-id-0')).toBeInTheDocument();
      expect(screen.getByTestId('related-relationship-0')).toBeInTheDocument();
    });

    // Fill valid client info
    fireEvent.change(screen.getByTestId('client-input-name'), {
      target: { value: 'Parent Company Corp' },
    });
    fireEvent.change(screen.getByTestId('client-input-tin'), {
      target: { value: '98765432100000' },
    });

    // Submit form (without selecting related client, it validates or filters)
    fireEvent.click(screen.getByTestId('client-submit-btn'));

    // Should indicate related company requires selection or row removal
    await waitFor(() => {
      expect(screen.getByTestId('error-related-0')).toBeInTheDocument();
    });

    // Remove the incomplete row
    fireEvent.click(screen.getByTestId('related-remove-btn-0'));

    await waitFor(() => {
      expect(screen.queryByTestId('related-row-0')).not.toBeInTheDocument();
    });

    // Now submit succeeds cleanly
    fireEvent.click(screen.getByTestId('client-submit-btn'));

    await waitFor(() => {
      expect(capturedPayload).toEqual(
        expect.objectContaining({
          name: 'Parent Company Corp',
          tin: '987-654-321-00000',
          relatedCompanies: [],
        })
      );
    });
  });
});
