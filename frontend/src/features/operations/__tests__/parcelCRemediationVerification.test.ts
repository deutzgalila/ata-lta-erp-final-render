import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTaskMutations } from '../api/useTasks';
import { operationsKeys } from '../api/queryKeys';
import { billingKeys } from '@/features/billing/api/queryKeys';
import {
  updateInvoiceAction,
  updateClientAddressAction,
} from '@/features/billing/api/useBillingMutations';
import { useSessionStore } from '@/lib/session';
import { closeTabSyncChannel, resetTabIdForTesting } from '@/lib/tabSync';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import { queryClient as globalQueryClient } from '@/lib/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('Challenger Stage 2_3: Parcel C Remediation Empirical Verification', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetTabIdForTesting(undefined, true);
    closeTabSyncChannel();

    useSessionStore.getState().setSession({
      user: {
        id: 'u-admin-1',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'work_request:view',
        'work_request:edit',
        'billing:view',
        'billing:edit',
      ],
      activeEntity: 'ATA',
    });
    useBlockingModalStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeTabSyncChannel();
    resetTabIdForTesting(undefined, true);
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    useBlockingModalStore.getState().reset();
  });

  // ==========================================================================
  // Area 1: useTasks.ts — exact: true prevents prefix matching
  // ==========================================================================
  describe('Area 1: useTasks.ts exact: true cache isolation', () => {
    it('1.1 verifies that exact: true on workRequestDetail strictly preserves tasks and taskDetail caches without invalidation', async () => {
      const wrId = 'wr-isolation-test-1';
      const taskId = 'task-iso-1';
      const taskRecord = {
        id: taskId,
        workRequestId: wrId,
        title: 'Initial Task',
        status: 'In Progress',
      };
      const updatedTaskRecord = {
        ...taskRecord,
        status: 'Completed',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: updatedTaskRecord }),
      });

      const { queryClient, wrapper } = createWrapper();

      // Seed all 3 related queries:
      // 1. workRequestDetail: ['operations', 'workRequests', 'detail', wrId]
      // 2. tasks: ['operations', 'workRequests', 'detail', wrId, 'tasks']
      // 3. taskDetail: ['operations', 'workRequests', 'detail', wrId, 'tasks', taskId]
      queryClient.setQueryData(operationsKeys.workRequestDetail(wrId), {
        id: wrId,
        title: 'Work Request Parent',
      });
      queryClient.setQueryData(operationsKeys.tasks(wrId), [taskRecord]);
      queryClient.setQueryData(operationsKeys.taskDetail(wrId, taskId), taskRecord);

      // Verify initial states are fresh (isInvalidated: false)
      expect(queryClient.getQueryState(operationsKeys.workRequestDetail(wrId))?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(operationsKeys.tasks(wrId))?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(operationsKeys.taskDetail(wrId, taskId))?.isInvalidated).toBe(false);

      // Execute updateTask mutation
      const { result } = renderHook(() => useTaskMutations(wrId), { wrapper });
      await result.current.updateTask({ taskId, data: { status: 'Completed' } });

      // 1. Parent work request detail MUST be invalidated
      const wrState = queryClient.getQueryState(operationsKeys.workRequestDetail(wrId));
      expect(wrState?.isInvalidated).toBe(true);

      // 2. tasks(wrId) MUST NOT be invalidated because exact: true prevented prefix matching
      const tasksState = queryClient.getQueryState(operationsKeys.tasks(wrId));
      expect(tasksState?.isInvalidated).toBe(false);

      // 3. taskDetail(wrId, taskId) MUST NOT be invalidated
      const taskDetailState = queryClient.getQueryState(operationsKeys.taskDetail(wrId, taskId));
      expect(taskDetailState?.isInvalidated).toBe(false);

      // 4. Verify authoritative server truth was pinned
      expect(queryClient.getQueryData(operationsKeys.taskDetail(wrId, taskId))).toEqual(updatedTaskRecord);
      const listData = queryClient.getQueryData<typeof taskRecord[]>(operationsKeys.tasks(wrId));
      expect(listData?.[0]).toEqual(updatedTaskRecord);
    });

    it('1.2 counter-proof: verifies that omitting exact: true DOES invalidate tasks and taskDetail caches (demonstrating why exact: true is mandatory)', async () => {
      const wrId = 'wr-prefix-proof-2';
      const taskId = 'task-proof-2';

      const { queryClient } = createWrapper();

      queryClient.setQueryData(operationsKeys.workRequestDetail(wrId), { id: wrId });
      queryClient.setQueryData(operationsKeys.tasks(wrId), [{ id: taskId }]);
      queryClient.setQueryData(operationsKeys.taskDetail(wrId, taskId), { id: taskId });

      // Fuzzy / prefix invalidation without exact: true
      await queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestDetail(wrId),
        // exact: false (default)
      });

      // Proof: Without exact: true, TanStack Query invalidates sub-resource keys
      expect(queryClient.getQueryState(operationsKeys.tasks(wrId))?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(operationsKeys.taskDetail(wrId, taskId))?.isInvalidated).toBe(true);
    });
  });

  // ==========================================================================
  // Area 2: useBillingMutations.ts — Removal of billingKeys.all
  // ==========================================================================
  describe('Area 2: useBillingMutations.ts removal of billingKeys.all prevents cache eviction', () => {
    it('2.1 updateInvoiceAction pins invoiceDetail and multi-list caches without invalidating them', async () => {
      const invoiceId = 'inv-test-iso-1';
      const initialInvoice = {
        id: invoiceId,
        invoiceNumber: 'ATA-SI-2026-0001',
        total: 5000,
        notes: 'Initial notes',
        clientAddress: '123 Initial St',
      };
      const serverUpdatedInvoice = {
        ...initialInvoice,
        notes: 'Updated notes from server',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: serverUpdatedInvoice }),
      });

      // Seed globalQueryClient (used by direct action functions)
      globalQueryClient.setQueryData(billingKeys.invoiceDetail(invoiceId), initialInvoice);
      globalQueryClient.setQueryData(billingKeys.invoicesList('ATA'), {
        data: [initialInvoice],
        meta: { total: 1, page: 1, limit: 20 },
      });
      globalQueryClient.setQueryData(billingKeys.counts('ATA'), { active: 1, overdue: 0 });
      globalQueryClient.setQueryData(billingKeys.aging('ATA'), { current: 5000 });

      const invalidateSpy = vi.spyOn(globalQueryClient, 'invalidateQueries');

      await updateInvoiceAction(invoiceId, { notes: 'Updated notes from server' }, 'ATA');

      // Assert billingKeys.all was NOT passed to invalidateQueries
      const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
      expect(invalidatedKeys).not.toContainEqual(billingKeys.all);
      expect(invalidatedKeys).not.toContainEqual(billingKeys.invoices());
      expect(invalidatedKeys).not.toContainEqual(billingKeys.invoiceDetail(invoiceId));

      // Assert secondary counters WERE invalidated
      expect(invalidatedKeys).toContainEqual(billingKeys.counts('ATA'));
      expect(invalidatedKeys).toContainEqual(billingKeys.aging('ATA'));

      // Assert detail cache was pinned with server data and is NOT invalidated
      const detail = globalQueryClient.getQueryData(billingKeys.invoiceDetail(invoiceId));
      expect(detail).toEqual(serverUpdatedInvoice);
      expect(globalQueryClient.getQueryState(billingKeys.invoiceDetail(invoiceId))?.isInvalidated).toBe(false);

      // Assert list cache was pinned in-place and is NOT invalidated
      const listData = globalQueryClient.getQueryData<{ data: typeof initialInvoice[] }>(
        billingKeys.invoicesList('ATA')
      );
      expect(listData?.data[0]?.notes).toBe('Updated notes from server');
      expect(globalQueryClient.getQueryState(billingKeys.invoicesList('ATA'))?.isInvalidated).toBe(false);
    });

    it('2.2 updateClientAddressAction pins invoiceDetail and list caches without invalidating them', async () => {
      const invoiceId = 'inv-test-iso-2';
      const initialInvoice = {
        id: invoiceId,
        invoiceNumber: 'ATA-SI-2026-0002',
        total: 10000,
        clientAddress: 'Old Client Address',
      };
      const serverUpdatedInvoice = {
        ...initialInvoice,
        clientAddress: 'New Verified Address 456',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: serverUpdatedInvoice }),
      });

      globalQueryClient.setQueryData(billingKeys.invoiceDetail(invoiceId), initialInvoice);
      globalQueryClient.setQueryData(billingKeys.invoicesList('ATA'), {
        data: [initialInvoice],
        meta: { total: 1, page: 1, limit: 20 },
      });
      globalQueryClient.setQueryData(billingKeys.counts('ATA'), { active: 1 });
      globalQueryClient.setQueryData(billingKeys.aging('ATA'), { current: 10000 });

      const invalidateSpy = vi.spyOn(globalQueryClient, 'invalidateQueries');

      await updateClientAddressAction(invoiceId, 'New Verified Address 456', 1, 'ATA');

      // Assert billingKeys.all was NOT passed
      const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
      expect(invalidatedKeys).not.toContainEqual(billingKeys.all);
      expect(invalidatedKeys).not.toContainEqual(billingKeys.invoices());
      expect(invalidatedKeys).not.toContainEqual(billingKeys.invoiceDetail(invoiceId));

      // Assert detail and list caches are pinned and NOT invalidated
      expect(globalQueryClient.getQueryData(billingKeys.invoiceDetail(invoiceId))).toEqual(
        serverUpdatedInvoice
      );
      expect(globalQueryClient.getQueryState(billingKeys.invoiceDetail(invoiceId))?.isInvalidated).toBe(false);
      expect(globalQueryClient.getQueryState(billingKeys.invoicesList('ATA'))?.isInvalidated).toBe(false);
    });

    it('2.3 counter-proof: verifies that including billingKeys.all would evict invoiceDetail and invoicesList', async () => {
      const invoiceId = 'inv-counter-proof';
      const { queryClient } = createWrapper();

      queryClient.setQueryData(billingKeys.invoiceDetail(invoiceId), { id: invoiceId });
      queryClient.setQueryData(billingKeys.invoicesList('ATA'), { data: [{ id: invoiceId }] });

      expect(queryClient.getQueryState(billingKeys.invoiceDetail(invoiceId))?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(billingKeys.invoicesList('ATA'))?.isInvalidated).toBe(false);

      // Invalidate billingKeys.all
      await queryClient.invalidateQueries({ queryKey: billingKeys.all });

      // Proof: billingKeys.all invalidates detail and lists
      expect(queryClient.getQueryState(billingKeys.invoiceDetail(invoiceId))?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(billingKeys.invoicesList('ATA'))?.isInvalidated).toBe(true);
    });
  });
});
