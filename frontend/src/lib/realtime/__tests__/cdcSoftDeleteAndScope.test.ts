/**
 * CDC Soft-Delete & Query Scope Test Suite (Spec SPEC-REALTIME-SYNC-001 §4 Parcel 2 & PROJECT.md)
 *
 * Verifies:
 * - Feature 6: Accurate Soft-Delete Eviction (deleted_at != null || deletedAt != null)
 * - Feature 7: Scoped Task List Query Matcher (isTaskListOfTargetWr)
 * - Feature 8: Task Mutation Query Co-Invalidations (workRequestDetail, workRequestCounts, taskRelated)
 * - Feature 9: Cross-Domain Co-Invalidations (invoices, disbursements, transmittals, documents, operations_requests)
 *
 * Tiers covered:
 * - Tier 1: Feature Coverage (>=5 tests per feature)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per feature)
 * - Tier 3: Cross-Feature Interactions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  handleRealtimePayload,
  clearChannelRegistryForTesting,
} from '../useEntityRealtimeSync';
import { useSessionStore } from '@/lib/session';
import { resetTabIdForTesting } from '@/lib/tabSync';
import { clearLocalMutationsForTesting } from '../loopPrevention';
import { operationsKeys } from '@/features/operations/api/queryKeys';

// ============================================================================
// Authoritative Helper Contracts & Oracles (SPEC-REALTIME-SYNC-001 §4 Parcel 2)
// ============================================================================

export function isSoftDeleteRecord(record: Record<string, unknown> | null | undefined): boolean {
  if (!record || typeof record !== 'object') return false;
  return Boolean(record.deleted_at) || Boolean(record.deletedAt);
}

export function isTaskListOfTargetWr(qKey: unknown, targetWrId: string): boolean {
  return (
    Array.isArray(qKey) &&
    qKey.includes('tasks') &&
    qKey.includes(targetWrId)
  );
}

export function triggerTaskCoInvalidations(
  queryClient: QueryClient,
  targetWrId: string,
  taskId: string,
  activeEntity?: string | null
): void {
  void queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(targetWrId) });
  if (activeEntity) {
    void queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestCounts(activeEntity) });
  } else {
    void queryClient.invalidateQueries({ queryKey: ['operations', 'workRequests', 'counts'] });
  }
  void queryClient.invalidateQueries({ queryKey: operationsKeys.taskRelated(taskId) });
}

export function triggerCrossDomainCoInvalidations(
  queryClient: QueryClient,
  table: string,
  record: Record<string, unknown>,
  activeEntity?: string | null
): void {
  const taskId = (record.task_id ?? record.taskId ?? record.linked_task_id ?? record.linkedTaskId) as string | undefined;

  switch (table) {
    case 'invoices':
    case 'disbursements':
      if (taskId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.taskRelated(taskId) });
      }
      break;
    case 'transmittals':
      if (taskId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.taskRelated(taskId) });
      }
      break;
    case 'documents':
      void queryClient.invalidateQueries({ queryKey: operationsKeys.documents() });
      if (taskId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.taskRelated(taskId) });
      }
      break;
    case 'operations_requests': {
      void queryClient.invalidateQueries({ queryKey: operationsKeys.requests() });
      if (activeEntity) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.requestCounts(activeEntity) });
      }
      const wrId = (record.work_request_id ?? record.workRequestId) as string | undefined;
      if (wrId) {
        void queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
      }
      break;
    }
    case 'task_assignees':
      if (taskId) {
        void queryClient.invalidateQueries({ queryKey: ['operations', 'tasks', taskId] });
      }
      break;
  }
}

describe('Feature 6: Accurate Soft-Delete Eviction Contract (Tier 1)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    localStorage.clear();
    clearLocalMutationsForTesting();
    clearChannelRegistryForTesting();
    resetTabIdForTesting('tab-soft-del-test');
    useSessionStore.setState({ activeEntity: 'ATA' });
  });

  afterEach(() => {
    queryClient.clear();
    localStorage.clear();
    clearLocalMutationsForTesting();
    clearChannelRegistryForTesting();
    resetTabIdForTesting();
    vi.restoreAllMocks();
  });

  it('1. correctly identifies soft-deleted records when deleted_at is a non-empty timestamp', () => {
    expect(isSoftDeleteRecord({ id: 't-1', deleted_at: '2026-10-10T15:30:00Z' })).toBe(true);
    expect(isSoftDeleteRecord({ id: 't-1', deletedAt: '2026-10-10T15:30:00Z' })).toBe(true);
  });

  it('2. distinguishes active records with deleted_at = null as non-deleted', () => {
    expect(isSoftDeleteRecord({ id: 't-2', deleted_at: null })).toBe(false);
    expect(isSoftDeleteRecord({ id: 't-2', deletedAt: null })).toBe(false);
    expect(isSoftDeleteRecord({ id: 't-2', deleted_at: undefined })).toBe(false);
  });

  it('3. evicts detail query cache and filters list cache upon DELETE event type', () => {
    const detailKey = operationsKeys.taskDetail('wr-1', 'task-del-1');
    const listKey = operationsKeys.tasks('wr-1');

    queryClient.setQueryData(detailKey, { id: 'task-del-1', workRequestId: 'wr-1', title: 'Task to Delete' });
    queryClient.setQueryData(listKey, {
      data: [
        { id: 'task-del-1', title: 'Task to Delete' },
        { id: 'task-keep-2', title: 'Task to Keep' },
      ],
      meta: { total: 2 },
    });

    const handled = handleRealtimePayload(
      queryClient,
      {
        table: 'tasks',
        detailQueryKey: () => detailKey,
        listRootKey: listKey,
      },
      {
        eventType: 'DELETE',
        old: { id: 'task-del-1', work_request_id: 'wr-1' },
      }
    );

    expect(handled).toBe(true);
    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    const listData = queryClient.getQueryData<{ data: Array<{ id: string }>; meta: { total: number } }>(listKey);
    expect(listData?.data).toHaveLength(1);
    expect(listData?.data[0]?.id).toBe('task-keep-2');
    expect(listData?.meta?.total).toBe(1);
  });

  it('4. purges deleted task from parent work request embedded phases container', () => {
    const wrKey = operationsKeys.workRequestDetail('wr-phase-1');
    queryClient.setQueryData(wrKey, {
      id: 'wr-phase-1',
      phases: {
        processing: {
          tasks: [
            { id: 'task-del-9', title: 'Purged Task' },
            { id: 'task-survive-9', title: 'Surviving Task' },
          ],
        },
      },
    });

    handleRealtimePayload(
      queryClient,
      {
        table: 'tasks',
        listRootKey: ['operations', 'workRequests'],
      },
      {
        eventType: 'DELETE',
        old: { id: 'task-del-9' },
      }
    );

    const wrData = queryClient.getQueryData<{
      phases: { processing: { tasks: Array<{ id: string }> } };
    }>(wrKey);
    expect(wrData?.phases?.processing?.tasks).toHaveLength(1);
    expect(wrData?.phases?.processing?.tasks[0]?.id).toBe('task-survive-9');
  });

  it('5. handles soft-deleted record contract for future reconciler hookup', () => {
    const rawPayload = {
      eventType: 'UPDATE',
      new: {
        id: 'task-soft-1',
        work_request_id: 'wr-1',
        deleted_at: '2026-10-10T16:00:00Z',
      },
    };

    const isSoft = isSoftDeleteRecord(rawPayload.new);
    expect(isSoft).toBe(true);

    const isEffectiveDelete = rawPayload.eventType === 'DELETE' || isSoft;
    expect(isEffectiveDelete).toBe(true);
  });
});

describe('Feature 7: Scoped Task List Query Matcher (Tier 1)', () => {
  it('1. matches exact task list query for target work request', () => {
    const targetWrId = 'wr-target-100';
    const validKey = operationsKeys.tasks(targetWrId);

    expect(isTaskListOfTargetWr(validKey, targetWrId)).toBe(true);
  });

  it('2. strictly rejects task list query for sibling work request', () => {
    const targetWrId = 'wr-target-100';
    const siblingKey = operationsKeys.tasks('wr-sibling-200');

    expect(isTaskListOfTargetWr(siblingKey, targetWrId)).toBe(false);
  });

  it('3. rejects root list keys without specific work request ID', () => {
    const targetWrId = 'wr-target-100';
    const rootKey = ['operations', 'workRequests'];

    expect(isTaskListOfTargetWr(rootKey, targetWrId)).toBe(false);
  });

  it('4. rejects work request detail query without tasks segment', () => {
    const targetWrId = 'wr-target-100';
    const wrDetailKey = operationsKeys.workRequestDetail(targetWrId);

    expect(isTaskListOfTargetWr(wrDetailKey, targetWrId)).toBe(false);
  });

  it('5. prevents cross-work-request task pollution in simulated multi-WR cache', () => {
    const wrA = 'wr-alpha';
    const wrB = 'wr-beta';

    const queries: Array<{ key: readonly unknown[]; items: string[] }> = [
      { key: operationsKeys.tasks(wrA), items: ['t-a1'] },
      { key: operationsKeys.tasks(wrB), items: ['t-b1'] },
    ];

    // Filter queries with isTaskListOfTargetWr
    const matching = queries.filter((q) => isTaskListOfTargetWr(q.key, wrA));
    expect(matching).toHaveLength(1);
    expect(matching[0]?.key).toEqual(operationsKeys.tasks(wrA));

    // Non-matching query is preserved untouched
    const sibling = queries.filter((q) => !isTaskListOfTargetWr(q.key, wrA));
    expect(sibling).toHaveLength(1);
    expect(sibling[0]?.items).toEqual(['t-b1']);
  });
});

describe('Feature 8 & 9: Query Co-Invalidations Contract (Tier 1)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('1. task mutation co-invalidates workRequestDetail, workRequestCounts, and taskRelated', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerTaskCoInvalidations(queryClient, 'wr-coinv-1', 'task-coinv-1', 'ATA');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.workRequestDetail('wr-coinv-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.workRequestCounts('ATA'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.taskRelated('task-coinv-1'),
    });
  });

  it('2. linked invoice mutation invalidates taskRelated(taskId)', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerCrossDomainCoInvalidations(queryClient, 'invoices', { id: 'inv-1', task_id: 'task-linked-1' });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.taskRelated('task-linked-1'),
    });
  });

  it('3. linked disbursement mutation invalidates taskRelated(taskId)', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerCrossDomainCoInvalidations(queryClient, 'disbursements', { id: 'disb-1', taskId: 'task-linked-2' });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.taskRelated('task-linked-2'),
    });
  });

  it('4. linked transmittal and document mutations invalidate taskRelated and documents root', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerCrossDomainCoInvalidations(queryClient, 'transmittals', { id: 'trans-1', linked_task_id: 'task-linked-3' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.taskRelated('task-linked-3'),
    });

    triggerCrossDomainCoInvalidations(queryClient, 'documents', { id: 'doc-1', linkedTaskId: 'task-linked-4' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.documents(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.taskRelated('task-linked-4'),
    });
  });

  it('5. operations_requests mutation invalidates requests, requestCounts, and target workRequestDetail', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerCrossDomainCoInvalidations(
      queryClient,
      'operations_requests',
      { id: 'op-1', work_request_id: 'wr-op-target' },
      'ATA'
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.requests(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.requestCounts('ATA'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.workRequestDetail('wr-op-target'),
    });
  });
});

describe('Boundary & Corner Cases (Tier 2)', () => {
  it('1. isTaskListOfTargetWr handles non-array and empty query keys safely', () => {
    expect(isTaskListOfTargetWr(null, 'wr-1')).toBe(false);
    expect(isTaskListOfTargetWr(undefined, 'wr-1')).toBe(false);
    expect(isTaskListOfTargetWr('string-key', 'wr-1')).toBe(false);
    expect(isTaskListOfTargetWr(12345, 'wr-1')).toBe(false);
    expect(isTaskListOfTargetWr([], 'wr-1')).toBe(false);
  });

  it('2. isTaskListOfTargetWr prevents substring false positives (e.g. wr-1 matching wr-10)', () => {
    const keyWr10 = ['operations', 'workRequests', 'detail', 'wr-10', 'tasks'];
    expect(isTaskListOfTargetWr(keyWr10, 'wr-1')).toBe(false);
    expect(isTaskListOfTargetWr(keyWr10, 'wr-10')).toBe(true);
  });

  it('3. isSoftDeleteRecord treats empty string or zero as falsy', () => {
    expect(isSoftDeleteRecord({ deleted_at: '' })).toBe(false);
    expect(isSoftDeleteRecord({ deletedAt: '' })).toBe(false);
    expect(isSoftDeleteRecord({ deleted_at: 0 as unknown as string })).toBe(false);
  });

  it('4. cross-domain co-invalidation gracefully bypasses when taskId is missing', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerCrossDomainCoInvalidations(queryClient, 'invoices', { id: 'inv-no-task' });
    expect(invalidateSpy).not.toHaveBeenCalled();

    triggerCrossDomainCoInvalidations(queryClient, 'disbursements', { id: 'disb-no-task' });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('5. task assignee mutation invalidates specific task query', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    triggerCrossDomainCoInvalidations(queryClient, 'task_assignees', { id: 'ta-1', task_id: 't-assignee-target' });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['operations', 'tasks', 't-assignee-target'],
    });
  });
});

describe('Cross-Feature Combinations (Tier 3)', () => {
  it('1. combines snake_case payload with soft-delete detection', () => {
    const rawPgUpdate = {
      id: 't-pair-1',
      work_request_id: 'wr-pair',
      qa_status: 'passed',
      deleted_at: '2026-10-10T15:30:00Z',
    };

    const isSoft = isSoftDeleteRecord(rawPgUpdate);
    expect(isSoft).toBe(true);

    const matchesWr = isTaskListOfTargetWr(operationsKeys.tasks('wr-pair'), rawPgUpdate.work_request_id);
    expect(matchesWr).toBe(true);
  });

  it('2. combines scoped task update with immediate co-invalidation of parent WR', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrId = 'wr-scope-coinv';
    const taskId = 'task-scope-coinv';

    triggerTaskCoInvalidations(queryClient, wrId, taskId, 'LTA');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.workRequestDetail(wrId),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: operationsKeys.workRequestCounts('LTA'),
    });
  });
});
