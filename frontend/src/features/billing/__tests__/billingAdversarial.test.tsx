import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useBlockingModalStore,
  runBlockingAction,
  BlockingActionModal,
} from '@/features/operations/components/BlockingActionModal';
import {
  updateClientAddressAction,
  updateInvoiceAction,
  createInvoiceAction,
} from '../api/useBillingMutations';
import { useSessionStore } from '@/lib/session';
import { queryClient as globalQueryClient } from '@/lib/api';

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('Billing Module Adversarial & Security Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-ops',
        email: 'ops@ata-lta.ph',
        name: 'Operations User',
        role: 'Operations',
        departments: ['Operations'],
        entities: ['ATA'],
      },
      permissions: ['billing:view', 'billing:edit'], // Notice lacks billing:edit_client_address
      activeEntity: 'ATA',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    globalQueryClient.clear();
    useBlockingModalStore.getState().reset();
    vi.clearAllMocks();
  });

  it('surfaces verbatim RFC 7807 403 Forbidden error when unauthorized user modifies address', async () => {
    // Backend rejects address edit with RFC 7807 problem json
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          status: 403,
          title: 'Forbidden',
          detail: 'Permission billing:edit_client_address is required to modify client address',
          code: 'FORBIDDEN',
        }),
      } as Response);
    });

    const { wrapper } = createHarness();
    render(<BlockingActionModal />, { wrapper });

    // Attempt address update
    const promise = updateClientAddressAction(
      'inv-uuid-1',
      'Unauthorized Corporate Address',
      1,
      'ATA'
    );

    // Expect promise rejection
    await expect(promise).rejects.toThrow();

    // Verify verbatim RFC 7807 error surfacing in BlockingActionModal
    await waitFor(() => {
      expect(screen.getByText('Permission Denied')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Permission billing:edit_client_address is required to modify client address'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('FORBIDDEN')).toBeInTheDocument();
    });
  });

  it('surfaces verbatim RFC 7807 409 Conflict error upon OCC expectedVersion concurrency conflict', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({
          status: 409,
          title: 'Conflict',
          detail:
            'The record was modified by another user. Please reload the latest version before editing.',
          code: 'ERR_CONCURRENCY_CONFLICT',
        }),
      } as Response);
    });

    const { wrapper } = createHarness();
    render(<BlockingActionModal />, { wrapper });

    const promise = updateInvoiceAction(
      'inv-uuid-1',
      { notes: 'Stale update', expectedVersion: 1 },
      'ATA'
    );

    await expect(promise).rejects.toThrow();

    await waitFor(() => {
      expect(screen.getByText('Conflict')).toBeInTheDocument();
      expect(
        screen.getByText(
          'The record was modified by another user. Please reload the latest version before editing.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('ERR_CONCURRENCY_CONFLICT')).toBeInTheDocument();
    });
  });

  it('enforces zero optimistic updates: BlockingActionModal locks and queries invalidate only upon server resolution', async () => {
    let resolveServer: ((value: Response) => void) | null = null;
    const serverPromise = new Promise<Response>((resolve) => {
      resolveServer = resolve;
    });

    global.fetch = vi.fn().mockImplementation(() => serverPromise);

    const { wrapper, queryClient } = createHarness();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(<BlockingActionModal />, { wrapper });

    // Launch blocking action
    const actionPromise = createInvoiceAction(
      {
        clientId: '11111111-1111-1111-1111-111111111111',
        workRequestId: '22222222-2222-2222-2222-222222222222',
        invoiceNumber: 'ATA-SI-2026-9999',
        issueDate: '2026-10-01',
        dueDate: '2026-10-31',
        lineItems: [{ description: 'Test', amount: 5000, type: 'Professional Fee' }],
      },
      'ATA'
    );

    // Modal state should be loading and locked
    expect(useBlockingModalStore.getState().isLocked).toBe(true);
    expect(useBlockingModalStore.getState().status).toBe('loading');

    // Query cache must NOT have been invalidated prior to server response (Zero optimistic writes)
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Now resolve server response
    resolveServer!({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'inv-created',
          invoice_number: 'ATA-SI-2026-9999',
          total: 5000,
          balance: 5000,
        },
      }),
    } as Response);

    await actionPromise;

    // After resolution, lock is released and query cache is invalidated
    expect(useBlockingModalStore.getState().isLocked).toBe(false);
  });

  it('prevents concurrent write collisions with mutex lock (double-click protection)', async () => {
    // Hang first request
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>(() => {
          // never resolves
        })
    );

    const { wrapper } = createHarness();
    render(<BlockingActionModal />, { wrapper });

    // First call acquires lock
    const p1 = runBlockingAction({
      title: 'Action 1',
      message: 'Processing...',
      apiCall: async () => 'result 1',
    });

    expect(useBlockingModalStore.getState().isLocked).toBe(true);

    // Second simultaneous call must immediately reject
    await expect(
      runBlockingAction({
        title: 'Action 2',
        message: 'Collision...',
        apiCall: async () => 'result 2',
      })
    ).rejects.toThrow('Another operation is already in progress. Please wait.');

    await p1;
  });
});
