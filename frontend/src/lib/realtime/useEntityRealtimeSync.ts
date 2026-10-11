/**
 * Generic CDC Realtime Sync Hook (Spec §4.3 & §5, Parcel E)
 *
 * Subscribes to PostgreSQL CDC changes on public schema tables via Supabase Realtime.
 * Enforces three mandatory safety guards:
 * 1. Tenant Isolation Guard: Discards cross-tenant payloads when activeEntity !== 'ALL'.
 * 2. Stale Version Rejection Guard: Discards payloads where payload.new.version <= localCachedVersion.
 * 3. Loop Prevention Guard: Discards payloads originated by current browser tab or local mutation registry.
 *
 * Reconciles TanStack Query detail and list caches via queryClient.setQueryData.
 * Guarantees clean teardown on unmount via supabase.removeChannel(channel).
 */

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isFeatureEnabled } from '@/lib/flags';
import { useSessionStore } from '@/lib/session';
import { isSelfOriginatedPayload, isLocalMutation } from './loopPrevention';
import { operationsKeys } from '@/features/operations/api/queryKeys';
import { billingKeys } from '@/features/billing/api/queryKeys';
import { disbursementKeys } from '@/features/disbursements/api/queryKeys';
import { resolveEntityUUID, resolveEntityCodeFromUUID } from './tenantResolver';

export type RealtimeTable =
  | 'work_requests'
  | 'tasks'
  | 'invoices'
  | 'disbursements'
  | string;

export interface UseEntityRealtimeSyncOptions<T = Record<string, unknown>> {
  table: RealtimeTable;
  detailQueryKey?: (id: string, record?: T) => readonly unknown[];
  listRootKey?: readonly unknown[];
  activeEntity?: string | null;
  activeEntityUUID?: string;
  channelName?: string;
  filter?: string;
  enabled?: boolean;
}

interface GenericEntityRecord {
  id?: string;
  version?: number;
  entity_id?: string;
  entityId?: string;
  entity?: string;
  entity_code?: string;
  work_request_id?: string;
  workRequestId?: string;
  phases?: Record<string, { tasks?: Array<{ id?: string }> }>;
  [key: string]: unknown;
}

interface GenericListResponse {
  data: GenericEntityRecord[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    unreadCount?: number;
    unread_count?: number;
    [key: string]: unknown;
  };
}

/**
 * Computes default detail query key for supported domain tables.
 */
export function getDefaultDetailQueryKey(
  table: string,
  id: string,
  record?: GenericEntityRecord
): readonly unknown[] | undefined {
  switch (table) {
    case 'work_requests':
      return operationsKeys.workRequestDetail(id);
    case 'tasks': {
      const wrId = record?.work_request_id ?? record?.workRequestId;
      return wrId ? operationsKeys.taskDetail(wrId, id) : undefined;
    }
    case 'invoices':
      return billingKeys.invoiceDetail(id);
    case 'disbursements':
      return disbursementKeys.detail(id);
    case 'operations_requests':
      return operationsKeys.requestDetail(id);
    case 'documents':
      return operationsKeys.documentDetail(id);
    default:
      return [table, 'detail', id];
  }
}

/**
 * Computes default list root query key for supported domain tables.
 */
export function getDefaultListRootKey(table: string): readonly unknown[] {
  switch (table) {
    case 'work_requests':
      return operationsKeys.workRequests();
    case 'tasks':
      return ['operations', 'tasks'];
    case 'invoices':
      return billingKeys.invoices();
    case 'disbursements':
      return disbursementKeys.lists();
    case 'operations_requests':
      return operationsKeys.requests();
    case 'documents':
      return operationsKeys.documents();
    default:
      return [table, 'list'];
  }
}

// ============================================================================
// Model Normalization Engine (Spec SPEC-REALTIME-SYNC-001 §4 Parcel 2)
// ============================================================================

/**
 * Normalizes PostgreSQL CDC task records into unified objects with both
 * camelCase and snake_case properties to ensure full TanStack Query and UI compatibility.
 */
export function normalizeCdcTask(record: Record<string, unknown>): Record<string, unknown> {
  if (!record || typeof record !== 'object') return record;
  const workRequestId = record.work_request_id ?? record.workRequestId;
  const qaStatus = record.qa_status ?? record.qaStatus ?? 'none';
  const dueDate = record.due_date ?? record.dueDate ?? null;
  const displayOrder = record.display_order ?? record.displayOrder ?? 0;
  const assigneeId = record.assignee_id !== undefined ? record.assignee_id : (record.assigneeId ?? null);
  const assigneeName = record.assignee_name !== undefined ? record.assignee_name : (record.assigneeName ?? null);
  const requiredLinkType = record.required_link_type !== undefined ? record.required_link_type : (record.requiredLinkType ?? null);
  const phaseEnteredAt = record.phase_entered_at ?? record.phaseEnteredAt ?? null;
  const assignedBy = record.assigned_by ?? record.assignedBy ?? null;
  const assignedAt = record.assigned_at ?? record.assignedAt ?? null;
  const deletedAt = record.deleted_at ?? record.deletedAt ?? null;

  return {
    ...record,
    workRequestId,
    work_request_id: workRequestId,
    qaStatus,
    qa_status: qaStatus,
    dueDate,
    due_date: dueDate,
    displayOrder,
    display_order: displayOrder,
    assigneeId,
    assignee_id: assigneeId,
    assigneeName,
    assignee_name: assigneeName,
    requiredLinkType,
    required_link_type: requiredLinkType,
    phaseEnteredAt,
    phase_entered_at: phaseEnteredAt,
    assignedBy,
    assigned_by: assignedBy,
    assignedAt,
    assigned_at: assignedAt,
    deletedAt,
    deleted_at: deletedAt,
  };
}

/**
 * Normalizes PostgreSQL CDC work_request records into unified objects with both
 * camelCase and snake_case properties.
 */
export function normalizeCdcWorkRequest(record: Record<string, unknown>): Record<string, unknown> {
  if (!record || typeof record !== 'object') return record;
  const workRequestNo = record.work_request_no ?? record.workRequestNo;
  const clientId = record.client_id ?? record.clientId;
  const clientName = record.client_name ?? record.clientName;
  const onHold = record.on_hold ?? record.onHold ?? false;
  const phaseEnteredAt = record.phase_entered_at ?? record.phaseEnteredAt ?? null;
  const requestedBy = record.requested_by ?? record.requestedBy ?? null;
  const assignedTo = record.assigned_to ?? record.assignedTo ?? null;
  const coAssignees = record.co_assignees ?? record.coAssignees ?? [];
  const dueDate = record.due_date ?? record.dueDate ?? null;
  const deletedAt = record.deleted_at ?? record.deletedAt ?? null;

  return {
    ...record,
    workRequestNo,
    work_request_no: workRequestNo,
    clientId,
    client_id: clientId,
    clientName,
    client_name: clientName,
    onHold,
    on_hold: onHold,
    phaseEnteredAt,
    phase_entered_at: phaseEnteredAt,
    requestedBy,
    requested_by: requestedBy,
    assignedTo,
    assigned_to: assignedTo,
    coAssignees,
    co_assignees: coAssignees,
    dueDate,
    due_date: dueDate,
    deletedAt,
    deleted_at: deletedAt,
  };
}

/**
 * Normalizes PostgreSQL CDC operations_request records into unified objects with both
 * camelCase and snake_case properties.
 */
export function normalizeCdcOperationsRequest(record: Record<string, unknown>): Record<string, unknown> {
  if (!record || typeof record !== 'object') return record;
  const type = record.request_type ?? record.type;
  const workRequestId = record.work_request_id ?? record.workRequestId;
  const linkedTaskId = record.linked_task_id ?? record.linkedTaskId;
  const clientId = record.client_id ?? record.clientId;
  const rejectionReason = record.rejection_reason ?? record.rejectionReason;

  return {
    ...record,
    type,
    request_type: type,
    workRequestId,
    work_request_id: workRequestId,
    linkedTaskId,
    linked_task_id: linkedTaskId,
    clientId,
    client_id: clientId,
    rejectionReason,
    rejection_reason: rejectionReason,
  };
}

/**
 * Normalizes PostgreSQL CDC notification records into unified objects with both
 * camelCase and snake_case properties.
 */
export function normalizeCdcNotification(record: Record<string, unknown>): Record<string, unknown> {
  if (!record || typeof record !== 'object') return record;
  const userId = record.user_id ?? record.userId;
  const readAt = record.read_at ?? record.readAt ?? null;
  const createdAt = record.created_at ?? record.createdAt;

  return {
    ...record,
    userId,
    user_id: userId,
    readAt,
    read_at: readAt,
    createdAt,
    created_at: createdAt,
  };
}

/**
 * Dispatches raw incoming CDC payloads to table-specific normalizers.
 */
export function normalizeCdcPayload(
  table: string,
  record: Record<string, unknown>
): Record<string, unknown> {
  switch (table) {
    case 'tasks':
      return normalizeCdcTask(record);
    case 'work_requests':
      return normalizeCdcWorkRequest(record);
    case 'operations_requests':
      return normalizeCdcOperationsRequest(record);
    case 'notifications':
      return normalizeCdcNotification(record);
    default:
      return record;
  }
}

/**
 * Checks whether an incoming CDC record represents a soft-deleted entity.
 */
export function isSoftDeleteRecord(record: Record<string, unknown> | null | undefined): boolean {
  if (!record || typeof record !== 'object') return false;
  return Boolean(record.deleted_at) || Boolean(record.deletedAt);
}

/**
 * Scoped query matcher ensuring tasks are only prepended to the matching parent work request.
 * Checks that the query key is an array, includes 'tasks', and includes targetWrId.
 */
export function isTaskListOfTargetWr(qKey: unknown, targetWrId: string): boolean {
  return (
    Array.isArray(qKey) &&
    qKey.includes('tasks') &&
    qKey.includes(targetWrId)
  );
}

/**
 * Invalidates related domain queries when a task is mutated (INSERT, UPDATE, DELETE).
 * - operationsKeys.workRequestDetail(targetWrId) -> re-evaluates gate status and blockers
 * - operationsKeys.workRequestCounts(activeEntity) -> updates task & work request counts
 * - operationsKeys.taskRelated(taskId) -> updates linked financial & document records
 */
export function triggerTaskCoInvalidations(
  queryClient: QueryClient,
  targetWrId: string,
  taskId: string,
  activeEntity?: string | null
): void {
  if (targetWrId) {
    void queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(targetWrId) });
  }
  if (activeEntity) {
    void queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestCounts(activeEntity) });
  } else {
    void queryClient.invalidateQueries({ queryKey: ['operations', 'workRequests', 'counts'] });
  }
  if (taskId) {
    void queryClient.invalidateQueries({ queryKey: operationsKeys.taskRelated(taskId) });
  }
}

/**
 * Propagates real-time events across domain boundaries:
 * - invoices / disbursements with task_id -> invalidate operationsKeys.taskRelated(taskId)
 * - transmittals with linked_task_id -> invalidate operationsKeys.taskRelated(taskId)
 * - documents -> invalidate operationsKeys.documents(); if linked_task_id -> invalidate operationsKeys.taskRelated(taskId)
 * - operations_requests -> invalidate operationsKeys.requests(), operationsKeys.requestCounts(activeEntity),
 *   and if work_request_id exists -> invalidate operationsKeys.workRequestDetail(workRequestId)
 * - task_assignees with task_id -> invalidate ['operations', 'tasks', taskId]
 */
export function triggerCrossDomainCoInvalidations(
  queryClient: QueryClient,
  table: string,
  record: Record<string, unknown>,
  activeEntity?: string | null
): void {
  const taskId = (
    record?.task_id ??
    record?.taskId ??
    record?.linked_task_id ??
    record?.linkedTaskId
  ) as string | undefined;

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
      } else {
        void queryClient.invalidateQueries({ queryKey: ['operations', 'requests', 'counts'] });
      }
      const wrId = (record?.work_request_id ?? record?.workRequestId) as string | undefined;
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

/**
 * Invalidates domain counters upon CDC events.
 */
function invalidateCounts(queryClient: QueryClient, table: string): void {
  switch (table) {
    case 'work_requests':
      void queryClient.invalidateQueries({ queryKey: ['operations', 'workRequests', 'counts'] });
      void queryClient.invalidateQueries({ queryKey: ['operations', 'counts'] });
      break;
    case 'tasks':
      void queryClient.invalidateQueries({ queryKey: ['operations', 'workRequests', 'counts'] });
      void queryClient.invalidateQueries({ queryKey: ['operations', 'counts'] });
      break;
    case 'invoices':
      void queryClient.invalidateQueries({ queryKey: ['billing', 'counts'] });
      break;
    case 'disbursements':
      void queryClient.invalidateQueries({ queryKey: ['disbursements', 'counts'] });
      break;
    case 'operations_requests':
      void queryClient.invalidateQueries({ queryKey: ['operations', 'requests', 'counts'] });
      break;
    case 'notifications':
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      break;
    default:
      void queryClient.invalidateQueries({ queryKey: [table, 'counts'] });
      break;
  }
}

/**
 * Updates tasks embedded in WorkRequest phases containers if present.
 */
function patchTaskInPhases(
  workRequest: GenericEntityRecord,
  taskId: string,
  updatedTask?: GenericEntityRecord
): GenericEntityRecord {
  if (!workRequest?.phases || typeof workRequest.phases !== 'object') {
    return workRequest;
  }

  let modified = false;
  const newPhases = { ...workRequest.phases };

  for (const phaseKey of Object.keys(newPhases)) {
    const container = newPhases[phaseKey];
    if (container && Array.isArray(container.tasks)) {
      if (container.tasks.some((t) => t?.id === taskId)) {
        modified = true;
        if (updatedTask) {
          newPhases[phaseKey] = {
            ...container,
            tasks: container.tasks.map((t) =>
              t?.id === taskId ? ({ ...t, ...updatedTask } as { id?: string }) : t
            ),
          };
        } else {
          newPhases[phaseKey] = {
            ...container,
            tasks: container.tasks.filter((t) => t?.id !== taskId),
          };
        }
      }
    }
  }

  return modified ? { ...workRequest, phases: newPhases } : workRequest;
}

/**
 * Core event handler for PostgreSQL CDC payloads.
 * Returns true if event was processed, false if dropped by one of the guards.
 */
export function handleRealtimePayload<T = Record<string, unknown>>(
  queryClient: QueryClient,
  options: UseEntityRealtimeSyncOptions<T>,
  payload: unknown
): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const rawPayload = payload as {
    eventType?: string;
    event?: string;
    new?: GenericEntityRecord;
    old?: GenericEntityRecord;
    commit_timestamp?: string;
  };

  const rawEventType = rawPayload.eventType || rawPayload.event;
  const eventType = rawEventType ? String(rawEventType).toUpperCase() : '';

  const payloadObj = {
    ...rawPayload,
    new:
      rawPayload.new &&
      typeof rawPayload.new === 'object' &&
      Object.keys(rawPayload.new).length > 0
        ? (normalizeCdcPayload(
            options.table,
            rawPayload.new as Record<string, unknown>
          ) as GenericEntityRecord)
        : rawPayload.new,
    old:
      rawPayload.old &&
      typeof rawPayload.old === 'object' &&
      Object.keys(rawPayload.old).length > 0
        ? (normalizeCdcPayload(
            options.table,
            rawPayload.old as Record<string, unknown>
          ) as GenericEntityRecord)
        : rawPayload.old,
  };

  if (rawPayload.new && typeof rawPayload.new === 'object') {
    try {
      rawPayload.new = payloadObj.new;
    } catch {
      // ignore non-extensible payload
    }
  }
  if (rawPayload.old && typeof rawPayload.old === 'object') {
    try {
      rawPayload.old = payloadObj.old;
    } catch {
      // ignore non-extensible payload
    }
  }

  const incomingRecord =
    payloadObj.new && Object.keys(payloadObj.new).length > 0 ? payloadObj.new : payloadObj.old;
  if (!incomingRecord) {
    return false;
  }

  const id = incomingRecord.id ?? payloadObj.new?.id ?? payloadObj.old?.id;
  if (!id) {
    return false;
  }

  // User Isolation Guard for Notifications
  if (options.table === 'notifications') {
    const currentUserId = useSessionStore.getState().user?.id;
    const payloadUserId = incomingRecord.user_id ?? incomingRecord.userId;

    if (!payloadUserId || !currentUserId) {
      return false; // Discard: unassigned, null user, or unauthenticated
    }

    const matchesUser =
      String(payloadUserId).trim().toLowerCase() ===
      String(currentUserId).trim().toLowerCase();

    if (!matchesUser) {
      return false; // Discard: notification belongs to another user
    }
  }

  // =========================================================================
  // Guard 1: Tenant Isolation Guard
  // =========================================================================
  const activeEntity =
    options.activeEntity !== undefined
      ? options.activeEntity
      : useSessionStore.getState().activeEntity;
  const targetUUID = options.activeEntityUUID || resolveEntityUUID(activeEntity);

  if (activeEntity !== 'ALL') {
    // Preserve explicit null values; do not coalesce null into undefined
    const recordEntityId =
      incomingRecord.entity_id !== undefined
        ? incomingRecord.entity_id
        : incomingRecord.entityId;
    const recordEntity =
      incomingRecord.entity !== undefined
        ? incomingRecord.entity
        : incomingRecord.entity_code;

    // Gracefully allow tables like `tasks` where entity_id and entity are not present
    const hasEntityField = recordEntityId !== undefined || recordEntity !== undefined;
    if (hasEntityField) {
      // Discard if session is unassigned
      if (!activeEntity) {
        return false;
      }

      // Discard if payload has explicit null for entity identifiers
      if (recordEntityId === null && recordEntity === null) {
        return false;
      }
      if (recordEntityId === null && recordEntity === undefined) {
        return false;
      }
      if (recordEntity === null && recordEntityId === undefined) {
        return false;
      }

      const recordCode =
        recordEntity ||
        (recordEntityId != null ? resolveEntityCodeFromUUID(String(recordEntityId)) : undefined);
      const recordUUID =
        (recordEntityId != null ? String(recordEntityId) : undefined) ||
        (recordEntity != null ? resolveEntityUUID(String(recordEntity)) : undefined);

      // 1. UUID matching: Case-insensitive and trimmed (RFC 4122 compliance)
      const matchesUUID = Boolean(
        targetUUID &&
        recordUUID &&
        String(recordUUID).trim().toLowerCase() === String(targetUUID).trim().toLowerCase()
      );

      // 2. Entity code matching: Case-insensitive and trimmed
      const matchesEntityCode = Boolean(
        activeEntity &&
        recordCode &&
        String(recordCode).trim().toUpperCase() === String(activeEntity).trim().toUpperCase()
      );

      const matches = matchesUUID || matchesEntityCode;

      if (!matches) {
        // Discard: cross-tenant, null-tenant, or unassigned-session event
        return false;
      }
    }
  }

  // =========================================================================
  // Guard 2: Stale Version Rejection Guard
  // =========================================================================
  const incomingVersion = payloadObj.new?.version;
  const detailKey = options.detailQueryKey
    ? options.detailQueryKey(id, incomingRecord as T)
    : getDefaultDetailQueryKey(options.table, id, incomingRecord);
  const listRootKey = options.listRootKey ?? getDefaultListRootKey(options.table);

  if (typeof incomingVersion === 'number') {
    let localCachedVersion: number | undefined = undefined;

    // 1. Inspect detail cache
    if (detailKey) {
      const detailData = queryClient.getQueryData<GenericEntityRecord>(detailKey);
      if (detailData && typeof detailData.version === 'number') {
        localCachedVersion = detailData.version;
      }
    }

    // 2. Inspect list caches under listRootKey
    if (listRootKey) {
      const matchingQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
        queryKey: listRootKey,
      });
      for (const [, listData] of matchingQueries) {
        if (!listData) continue;
        let itemVersion: number | undefined = undefined;

        if (Array.isArray(listData)) {
          const found = listData.find((item) => item?.id === id);
          if (found && typeof found.version === 'number') {
            itemVersion = found.version;
          }
        } else if (Array.isArray(listData?.data)) {
          const found = listData.data.find((item) => item?.id === id);
          if (found && typeof found.version === 'number') {
            itemVersion = found.version;
          }
        }

        if (typeof itemVersion === 'number') {
          if (localCachedVersion === undefined || itemVersion > localCachedVersion) {
            localCachedVersion = itemVersion;
          }
        }
      }
    }

    if (typeof localCachedVersion === 'number' && incomingVersion <= localCachedVersion) {
      // Discard: stale or equal version
      return false;
    }
  }

  // =========================================================================
  // Guard 3: Loop Prevention Guard
  // =========================================================================
  if (isSelfOriginatedPayload(payload)) {
    // Discard: originated by current browser tab
    return false;
  }

  if (isLocalMutation(options.table, id, incomingVersion)) {
    // Discard: local mutation recently dispatched in this tab
    return false;
  }

  // =========================================================================
  // Guards Passed: TanStack Query Cache Reconciliation
  // =========================================================================
  const isSoftDeleted = isSoftDeleteRecord(incomingRecord);
  const isDelete =
    eventType === 'DELETE' ||
    isSoftDeleted ||
    (eventType !== 'UPDATE' && !payloadObj.new && Boolean(payloadObj.old));
  const isInsert =
    !isDelete &&
    (eventType === 'INSERT' ||
      (eventType !== 'UPDATE' && Boolean(payloadObj.new) && !payloadObj.old));

  if (isDelete) {
    // Remove detail cache
    if (detailKey) {
      queryClient.removeQueries({ queryKey: detailKey });
    }

    // Filter out from matching list caches
    if (listRootKey) {
      const matchingQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
        queryKey: listRootKey,
      });
      let deletedUnreadNotification = false;
      for (const [qKey, listData] of matchingQueries) {
        if (!listData) continue;

        if (Array.isArray(listData)) {
          if (listData.some((item) => item?.id === id)) {
            queryClient.setQueryData(
              qKey,
              listData.filter((item) => item?.id !== id)
            );
          }
        } else if (Array.isArray(listData?.data)) {
          if (listData.data.some((item) => item?.id === id)) {
            const deletedItem = listData.data.find((item) => item?.id === id);
            const wasUnread =
              options.table === 'notifications' &&
              Boolean(deletedItem && !deletedItem.read_at && !deletedItem.readAt);

            if (wasUnread) {
              deletedUnreadNotification = true;
            }

            queryClient.setQueryData(qKey, {
              ...listData,
              data: listData.data.filter((item) => item?.id !== id),
              meta: listData.meta
                ? {
                    ...listData.meta,
                    total: Math.max(0, (listData.meta.total ?? listData.data.length) - 1),
                    unreadCount:
                      wasUnread && typeof listData.meta.unreadCount === 'number'
                        ? Math.max(0, listData.meta.unreadCount - 1)
                        : listData.meta.unreadCount,
                    unread_count:
                      wasUnread && typeof listData.meta.unread_count === 'number'
                        ? Math.max(0, listData.meta.unread_count - 1)
                        : listData.meta.unread_count,
                  }
                : listData.meta,
            });
          }
        }

        if (options.table === 'tasks') {
          if (!Array.isArray(listData) && typeof listData === 'object' && 'phases' in listData) {
            const candidateRecord = listData as unknown as GenericEntityRecord;
            queryClient.setQueryData(qKey, patchTaskInPhases(candidateRecord, id, undefined));
          } else if (
            typeof listData === 'object' &&
            'data' in listData &&
            Array.isArray((listData as GenericListResponse).data)
          ) {
            const resp = listData as GenericListResponse;
            const hasPhases = resp.data.some((item) => Boolean(item?.phases));
            if (hasPhases) {
              queryClient.setQueryData(qKey, {
                ...resp,
                data: resp.data.map((wr) => patchTaskInPhases(wr, id, undefined)),
              });
            }
          }
        }
      }

      if (options.table === 'tasks') {
        const wrQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
          queryKey: operationsKeys.workRequests(),
        });
        for (const [wrQKey, wrListData] of wrQueries) {
          if (!wrListData) continue;
          if (!Array.isArray(wrListData) && typeof wrListData === 'object' && 'phases' in wrListData) {
            const candidateRecord = wrListData as unknown as GenericEntityRecord;
            queryClient.setQueryData(wrQKey, patchTaskInPhases(candidateRecord, id, undefined));
          } else if (
            typeof wrListData === 'object' &&
            'data' in wrListData &&
            Array.isArray((wrListData as GenericListResponse).data)
          ) {
            const resp = wrListData as GenericListResponse;
            const hasPhases = resp.data.some((item) => Boolean(item?.phases));
            if (hasPhases) {
              queryClient.setQueryData(wrQKey, {
                ...resp,
                data: resp.data.map((wr) => patchTaskInPhases(wr, id, undefined)),
              });
            }
          }
        }
      }

      if (options.table === 'notifications') {
        const wasUnread =
          deletedUnreadNotification ||
          Boolean(
            payloadObj.old &&
              (payloadObj.old.read_at !== undefined || payloadObj.old.readAt !== undefined) &&
              !payloadObj.old.read_at &&
              !payloadObj.old.readAt
          );
        if (wasUnread) {
          const deleteTimestamp =
            payloadObj.new?.deleted_at ??
            payloadObj.new?.deletedAt ??
            payloadObj.old?.deleted_at ??
            payloadObj.old?.deletedAt ??
            rawPayload.commit_timestamp ??
            'deleted';
          const eventToken = `notifications:delete:${id}:${deleteTimestamp}`;
          if (recordNotificationEvent(eventToken)) {
            const currentUnread = useSessionStore.getState().unreadCount;
            useSessionStore.getState().setUnreadCount(Math.max(0, currentUnread - 1));
          }
        }
      }
    }

    // Purge embedded task objects from workRequestDetail if targetWrId is known
    if (options.table === 'tasks') {
      const targetWrId = (
        payloadObj.new?.work_request_id ??
        payloadObj.new?.workRequestId ??
        payloadObj.old?.work_request_id ??
        payloadObj.old?.workRequestId ??
        incomingRecord.work_request_id ??
        incomingRecord.workRequestId
      ) as string | undefined;

      if (targetWrId) {
        const wrDetailKey = operationsKeys.workRequestDetail(targetWrId);
        const wrData = queryClient.getQueryData<GenericEntityRecord>(wrDetailKey);
        if (wrData?.phases) {
          queryClient.setQueryData(wrDetailKey, patchTaskInPhases(wrData, id, undefined));
        }
      }
    }
  } else if (isInsert) {
    // Populate detail cache
    if (detailKey && payloadObj.new) {
      queryClient.setQueryData(detailKey, payloadObj.new);
    }

    // Prepend to matching list caches
    if (listRootKey && payloadObj.new) {
      const targetWrId = (
        payloadObj.new.work_request_id ??
        payloadObj.new.workRequestId ??
        incomingRecord.work_request_id ??
        incomingRecord.workRequestId
      ) as string | undefined;

      const matchingQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
        queryKey: listRootKey,
      });

      // Deduplication check: for notifications, verify whether notification ID already exists in query list
      let alreadyExistsInList = false;
      if (options.table === 'notifications') {
        for (const [, listData] of matchingQueries) {
          if (!listData) continue;
          if (Array.isArray(listData)) {
            if (listData.some((item) => item?.id === id)) {
              alreadyExistsInList = true;
              break;
            }
          } else if (Array.isArray(listData?.data)) {
            if (listData.data.some((item) => item?.id === id)) {
              alreadyExistsInList = true;
              break;
            }
          }
        }
      }

      if (!alreadyExistsInList) {
        for (const [qKey, listData] of matchingQueries) {
          if (!listData) continue;

          // Scoped matcher for tasks: only prepend to matching parent work request query
          if (options.table === 'tasks') {
            // Guard: Never prepend task records to work request list queries
            if (
              Array.isArray(qKey) &&
              qKey.length >= 3 &&
              qKey[0] === 'operations' &&
              qKey[1] === 'workRequests' &&
              qKey[2] === 'list'
            ) {
              continue;
            }
            if (!targetWrId || !isTaskListOfTargetWr(qKey, targetWrId)) {
              continue;
            }
          }

          if (Array.isArray(listData)) {
            if (!listData.some((item) => item?.id === id)) {
              queryClient.setQueryData(qKey, [payloadObj.new, ...listData]);
            }
          } else if (Array.isArray(listData?.data)) {
            if (!listData.data.some((item) => item?.id === id)) {
              const isUnread =
                options.table === 'notifications' &&
                !payloadObj.new.read_at &&
                !payloadObj.new.readAt;

              queryClient.setQueryData(qKey, {
                ...listData,
                data: [payloadObj.new, ...listData.data],
                meta: listData.meta
                  ? {
                      ...listData.meta,
                      total: (listData.meta.total ?? listData.data.length) + 1,
                      unreadCount:
                        isUnread
                          ? (listData.meta.unreadCount ?? 0) + 1
                          : listData.meta.unreadCount,
                      unread_count:
                        isUnread
                          ? (listData.meta.unread_count ?? 0) + 1
                          : listData.meta.unread_count,
                    }
                  : listData.meta,
              });
            }
          }
        }

        // If notification insert is unread, increment sessionStore unreadCount in real time (deduplicated)
        if (options.table === 'notifications' && !payloadObj.new.read_at && !payloadObj.new.readAt) {
          const createTimestamp =
            payloadObj.new.created_at ??
            payloadObj.new.createdAt ??
            rawPayload.commit_timestamp ??
            'created';
          const eventToken = `notifications:insert:${id}:${createTimestamp}`;
          if (recordNotificationEvent(eventToken)) {
            const currentUnread = useSessionStore.getState().unreadCount;
            useSessionStore.getState().setUnreadCount(currentUnread + 1);
          }
        }
      }
    }
  } else {
    // UPDATE
    // Patch detail cache
    if (detailKey && payloadObj.new) {
      queryClient.setQueryData(detailKey, (old: unknown) => {
        if (!old || typeof old !== 'object') {
          return payloadObj.new;
        }
        return { ...(old as Record<string, unknown>), ...payloadObj.new };
      });
    }

    // Patch matching list caches
    if (listRootKey && payloadObj.new) {
      const matchingQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
        queryKey: listRootKey,
      });
      let transitionedToRead = false;
      for (const [qKey, listData] of matchingQueries) {
        if (!listData) continue;

        if (Array.isArray(listData)) {
          if (listData.some((item) => item?.id === id)) {
            queryClient.setQueryData(
              qKey,
              listData.map((item) => (item?.id === id ? { ...item, ...payloadObj.new } : item))
            );
          }
        } else if (Array.isArray(listData?.data)) {
          if (listData.data.some((item) => item?.id === id)) {
            const oldItem = listData.data.find((item) => item?.id === id);
            const wasUnread =
              options.table === 'notifications' &&
              Boolean(oldItem && !oldItem.read_at && !oldItem.readAt);
            const isNowRead =
              options.table === 'notifications' &&
              Boolean(payloadObj.new.read_at || payloadObj.new.readAt);
            const isTransitionToRead = wasUnread && isNowRead;

            if (isTransitionToRead) {
              transitionedToRead = true;
            }

            queryClient.setQueryData(qKey, {
              ...listData,
              data: listData.data.map((item) =>
                item?.id === id ? { ...item, ...payloadObj.new } : item
              ),
              meta:
                listData.meta && isTransitionToRead
                  ? {
                      ...listData.meta,
                      unreadCount:
                        typeof listData.meta.unreadCount === 'number'
                          ? Math.max(0, listData.meta.unreadCount - 1)
                          : listData.meta.unreadCount,
                      unread_count:
                        typeof listData.meta.unread_count === 'number'
                          ? Math.max(0, listData.meta.unread_count - 1)
                          : listData.meta.unread_count,
                    }
                  : listData.meta,
            });
          }
        }

        if (options.table === 'tasks') {
          if (!Array.isArray(listData) && typeof listData === 'object' && 'phases' in listData) {
            const candidateRecord = listData as unknown as GenericEntityRecord;
            queryClient.setQueryData(qKey, patchTaskInPhases(candidateRecord, id, payloadObj.new));
          } else if (
            typeof listData === 'object' &&
            'data' in listData &&
            Array.isArray((listData as GenericListResponse).data)
          ) {
            const resp = listData as GenericListResponse;
            const hasPhases = resp.data.some((item) => Boolean(item?.phases));
            if (hasPhases) {
              queryClient.setQueryData(qKey, {
                ...resp,
                data: resp.data.map((wr) => patchTaskInPhases(wr, id, payloadObj.new)),
              });
            }
          }
        }
      }

      if (options.table === 'tasks') {
        const wrQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
          queryKey: operationsKeys.workRequests(),
        });
        for (const [wrQKey, wrListData] of wrQueries) {
          if (!wrListData) continue;
          if (!Array.isArray(wrListData) && typeof wrListData === 'object' && 'phases' in wrListData) {
            const candidateRecord = wrListData as unknown as GenericEntityRecord;
            queryClient.setQueryData(wrQKey, patchTaskInPhases(candidateRecord, id, payloadObj.new));
          } else if (
            typeof wrListData === 'object' &&
            'data' in wrListData &&
            Array.isArray((wrListData as GenericListResponse).data)
          ) {
            const resp = wrListData as GenericListResponse;
            const hasPhases = resp.data.some((item) => Boolean(item?.phases));
            if (hasPhases) {
              queryClient.setQueryData(wrQKey, {
                ...resp,
                data: resp.data.map((wr) => patchTaskInPhases(wr, id, payloadObj.new)),
              });
            }
          }
        }
      }

      if (options.table === 'notifications') {
        const wasTransitionToRead =
          transitionedToRead ||
          Boolean(
            payloadObj.old &&
              (payloadObj.old.read_at !== undefined || payloadObj.old.readAt !== undefined) &&
              !payloadObj.old.read_at &&
              !payloadObj.old.readAt &&
              (payloadObj.new.read_at || payloadObj.new.readAt)
          );
        if (wasTransitionToRead) {
          const readTimestamp =
            payloadObj.new.read_at ??
            payloadObj.new.readAt ??
            payloadObj.new.updated_at ??
            payloadObj.new.updatedAt ??
            rawPayload.commit_timestamp ??
            'read';
          const eventToken = `notifications:read:${id}:${readTimestamp}`;
          if (recordNotificationEvent(eventToken)) {
            const currentUnread = useSessionStore.getState().unreadCount;
            useSessionStore.getState().setUnreadCount(Math.max(0, currentUnread - 1));
          }
        }
      }
    }

    // Update phases in workRequestDetail directly if targetWrId is known
    if (options.table === 'tasks' && payloadObj.new) {
      const targetWrId = (
        payloadObj.new?.work_request_id ??
        payloadObj.new?.workRequestId ??
        incomingRecord.work_request_id ??
        incomingRecord.workRequestId
      ) as string | undefined;

      if (targetWrId) {
        const wrDetailKey = operationsKeys.workRequestDetail(targetWrId);
        const wrData = queryClient.getQueryData<GenericEntityRecord>(wrDetailKey);
        if (wrData?.phases) {
          queryClient.setQueryData(wrDetailKey, patchTaskInPhases(wrData, id, payloadObj.new));
        }
      }
    }
  }

  // Invalidate domain counter queries
  invalidateCounts(queryClient, options.table);

  // Trigger task mutation co-invalidations
  if (options.table === 'tasks') {
    const targetWrId = (
      payloadObj.new?.work_request_id ??
      payloadObj.new?.workRequestId ??
      payloadObj.old?.work_request_id ??
      payloadObj.old?.workRequestId ??
      incomingRecord.work_request_id ??
      incomingRecord.workRequestId
    ) as string | undefined;

    if (targetWrId) {
      triggerTaskCoInvalidations(queryClient, targetWrId, id, activeEntity);
    }
  }

  // Trigger cross-domain co-invalidations
  triggerCrossDomainCoInvalidations(
    queryClient,
    options.table,
    incomingRecord as Record<string, unknown>,
    activeEntity
  );

  return true;
}

/**
 * Shared channel subscription entry managing multi-component multiplexing.
 */
interface ChannelSubscriptionEntry {
  channel: ReturnType<typeof supabase.channel>;
  subscribers: Set<(payload: unknown) => void>;
}

/**
 * Module-level tracking of processed notification counter mutation tokens
 * to prevent duplicate increments/decrements across multiple subscribers and replayed events.
 */
const MAX_PROCESSED_NOTIFICATION_EVENTS = 2000;
const processedNotificationEvents = new Set<string>();

function recordNotificationEvent(token: string): boolean {
  if (processedNotificationEvents.has(token)) {
    return false;
  }
  if (processedNotificationEvents.size >= MAX_PROCESSED_NOTIFICATION_EVENTS) {
    const oldest = processedNotificationEvents.keys().next().value;
    if (oldest !== undefined) {
      processedNotificationEvents.delete(oldest);
    }
  }
  processedNotificationEvents.add(token);
  return true;
}

/**
 * Module-level channel subscription registry for reference counting and
 * preventing cross-component unmount teardown collision.
 */
const activeChannelRegistry = new Map<string, ChannelSubscriptionEntry>();

/**
 * Testing helper to reset channel registry state between test suites.
 */
export function clearChannelRegistryForTesting(): void {
  activeChannelRegistry.clear();
  processedNotificationEvents.clear();
}

/**
 * Generic React hook for subscribing to Supabase PostgreSQL CDC changes.
 */
export function useEntityRealtimeSync<T = Record<string, unknown>>(
  options: UseEntityRealtimeSyncOptions<T>
): void {
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Early exit if globally disabled or explicitly disabled via options
    if (options.enabled === false) {
      return;
    }

    if (!isFeatureEnabled('realtime_sync')) {
      return;
    }

    const channelName = options.channelName ?? `cdc_${options.table}`;
    const registryKey = options.channelName
      ? `custom:${options.channelName}`
      : `table:${options.table}${options.filter ? `:${options.filter}` : ''}`;

    // Handler for this specific hook instance
    const handlePayload = (payload: unknown) => {
      handleRealtimePayload(queryClient, optionsRef.current, payload);
    };

    let entry = activeChannelRegistry.get(registryKey);

    if (!entry) {
      // First component subscribing: create Supabase channel and bind single listener
      const channel = supabase.channel(channelName);

      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: options.table,
          ...(options.filter ? { filter: options.filter } : {}),
        },
        (payload) => {
          const currentEntry = activeChannelRegistry.get(registryKey);
          if (currentEntry) {
            for (const subCallback of currentEntry.subscribers) {
              try {
                subCallback(payload);
              } catch (err) {
                console.error('[Realtime] Error in subscriber callback:', err);
              }
            }
          }
        }
      );

      channel.subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          const errObj = err as { message?: string; cause?: { code?: number; wasClean?: boolean } } | undefined;
          const isCleanClose =
            errObj?.cause?.code === 1000 ||
            errObj?.cause?.code === 1001 ||
            errObj?.cause?.wasClean === true ||
            errObj?.message?.includes('socket closed: 1000') ||
            errObj?.message?.includes('socket closed: 1001');

          if (!isCleanClose) {
            console.warn(`[Realtime] Subscription error on ${options.table}:`, err);
          }
        }
      });

      entry = {
        channel,
        subscribers: new Set(),
      };
      activeChannelRegistry.set(registryKey, entry);
    }

    // Register this component's callback
    entry.subscribers.add(handlePayload);

    // Teardown: unregister callback and remove channel ONLY when last subscriber unmounts
    return () => {
      const currentEntry = activeChannelRegistry.get(registryKey);
      if (currentEntry) {
        currentEntry.subscribers.delete(handlePayload);

        if (currentEntry.subscribers.size === 0) {
          activeChannelRegistry.delete(registryKey);
          void supabase.removeChannel(currentEntry.channel);
        }
      }
    };
  }, [queryClient, options.table, options.channelName, options.enabled, options.filter]);
}
