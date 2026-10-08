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
      return ['operations', 'workRequests'];
    case 'invoices':
      return billingKeys.invoices();
    case 'disbursements':
      return disbursementKeys.lists();
    default:
      return [table, 'list'];
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

  const payloadObj = payload as {
    eventType?: string;
    event?: string;
    new?: GenericEntityRecord;
    old?: GenericEntityRecord;
  };

  const rawEventType = payloadObj.eventType || payloadObj.event;
  const eventType = rawEventType ? String(rawEventType).toUpperCase() : '';

  const incomingRecord =
    payloadObj.new && Object.keys(payloadObj.new).length > 0 ? payloadObj.new : payloadObj.old;
  if (!incomingRecord) {
    return false;
  }

  const id = incomingRecord.id ?? payloadObj.new?.id ?? payloadObj.old?.id;
  if (!id) {
    return false;
  }

  // =========================================================================
  // Guard 1: Tenant Isolation Guard
  // =========================================================================
  const activeEntity =
    options.activeEntity !== undefined
      ? options.activeEntity
      : useSessionStore.getState().activeEntity;
  const activeEntityUUID = options.activeEntityUUID;

  if (activeEntity !== 'ALL') {
    // Preserve explicit null values; do not coalesce null into undefined
    const recordEntityId =
      incomingRecord.entity_id !== undefined
        ? incomingRecord.entity_id
        : incomingRecord.entityId;
    const recordEntity = incomingRecord.entity;

    // Gracefully allow tables like `tasks` where entity_id and entity are not present
    const hasEntityField = recordEntityId !== undefined || recordEntity !== undefined;
    if (hasEntityField) {
      // 1. UUID matching: Case-insensitive and trimmed (RFC 4122 compliance)
      const matchesUUID = Boolean(
        activeEntityUUID &&
        recordEntityId != null &&
        String(recordEntityId).trim().toLowerCase() === String(activeEntityUUID).trim().toLowerCase()
      );

      // 2. Entity code matching: Case-insensitive and trimmed
      const matchesEntityCode = Boolean(
        activeEntity && (
          (recordEntityId != null && String(recordEntityId).trim().toUpperCase() === String(activeEntity).trim().toUpperCase()) ||
          (recordEntity != null && String(recordEntity).trim().toUpperCase() === String(activeEntity).trim().toUpperCase())
        )
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
  const isDelete = eventType === 'DELETE' || (eventType !== 'UPDATE' && !payloadObj.new && Boolean(payloadObj.old));
  const isInsert = eventType === 'INSERT' || (eventType !== 'UPDATE' && Boolean(payloadObj.new) && !payloadObj.old);

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
            queryClient.setQueryData(qKey, {
              ...listData,
              data: listData.data.filter((item) => item?.id !== id),
              meta: listData.meta
                ? {
                    ...listData.meta,
                    total: Math.max(0, (listData.meta.total ?? listData.data.length) - 1),
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
    }
  } else if (isInsert) {
    // Populate detail cache
    if (detailKey && payloadObj.new) {
      queryClient.setQueryData(detailKey, payloadObj.new);
    }

    // Prepend to matching list caches
    if (listRootKey && payloadObj.new) {
      const matchingQueries = queryClient.getQueriesData<GenericListResponse | GenericEntityRecord[]>({
        queryKey: listRootKey,
      });
      for (const [qKey, listData] of matchingQueries) {
        if (!listData) continue;

        if (Array.isArray(listData)) {
          if (!listData.some((item) => item?.id === id)) {
            queryClient.setQueryData(qKey, [payloadObj.new, ...listData]);
          }
        } else if (Array.isArray(listData?.data)) {
          if (!listData.data.some((item) => item?.id === id)) {
            queryClient.setQueryData(qKey, {
              ...listData,
              data: [payloadObj.new, ...listData.data],
              meta: listData.meta
                ? {
                    ...listData.meta,
                    total: (listData.meta.total ?? listData.data.length) + 1,
                  }
                : listData.meta,
            });
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
            queryClient.setQueryData(qKey, {
              ...listData,
              data: listData.data.map((item) =>
                item?.id === id ? { ...item, ...payloadObj.new } : item
              ),
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
    }
  }

  // Invalidate domain counter queries
  invalidateCounts(queryClient, options.table);

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
 * Module-level channel subscription registry for reference counting and
 * preventing cross-component unmount teardown collision.
 */
const activeChannelRegistry = new Map<string, ChannelSubscriptionEntry>();

/**
 * Testing helper to reset channel registry state between test suites.
 */
export function clearChannelRegistryForTesting(): void {
  activeChannelRegistry.clear();
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

      channel.subscribe((_status, err) => {
        if (err) {
          console.warn(`[Realtime] Subscription error on ${options.table}:`, err);
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
