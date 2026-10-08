/**
 * TanStack Query Hooks for Notifications API Contract (notifications@2.0.0)
 *
 * Rules:
 * - 30s polling (no websockets)
 * - R2: No optimistic updates (mutate -> await -> invalidate)
 *   Sanctioned exception: read-state flips (mark read / mark all read) are
 *   optimistic-with-rollback — pure local read flags plus the session badge
 *   counter, snapshotted and restored on failure, reconciled on settle.
 * - R3: Verbatim RFC 7807 error surfacing
 * - Citation: docs/api-contracts/modules/notifications.md
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { dashboardKeys } from './queryKeys';
import type {
  NotificationItem,
  RawNotificationItemApi,
  RawNotificationListApiResponse,
  NotificationListResponse,
  NotificationPayload,
} from './types';
import { rawNotificationListApiResponseSchema } from './schemas';

// ============================================================================
// 1. Transformer
// ============================================================================

export function mapRawNotificationItem(raw: RawNotificationItemApi): NotificationItem {
  return {
    id: raw.id,
    userId: raw.user_id,
    type: raw.type,
    payload: (raw.payload || {}) as NotificationPayload,
    readAt: raw.read_at ?? null,
    createdAt: raw.created_at,
  };
}

// ============================================================================
// 2. Query Hooks
// ============================================================================

/**
 * Fetch notifications for authenticated user, unread first / newest first.
 * Refetches every 30 seconds per spec §4.2.
 */
export function useNotifications(params?: { limit?: number; cursor?: string }) {
  const setUnreadCount = useSessionStore((state) => state.setUnreadCount);

  return useQuery({
    queryKey: dashboardKeys.notifications.list(params),
    queryFn: async (): Promise<NotificationListResponse> => {
      const search = new URLSearchParams();
      if (params?.limit) search.set('limit', String(params.limit));
      if (params?.cursor) search.set('cursor', params.cursor);

      const qs = search.toString();
      const path = qs ? `/notifications?${qs}` : '/notifications';
      const response = await apiRequest<RawNotificationListApiResponse>(path);

      if (process.env.NODE_ENV !== 'production') {
        const parsed = rawNotificationListApiResponseSchema.safeParse(response);
        if (!parsed.success) {
          console.warn('[useNotifications] Response schema validation warning:', parsed.error);
        }
      }

      const items = (response.data || []).map(mapRawNotificationItem);
      const meta = response.meta || {};

      // If meta provides unread_count, keep session store in sync
      if (typeof meta.unread_count === 'number') {
        setUnreadCount(meta.unread_count);
      } else {
        const computedUnread = items.filter((n) => !n.readAt).length;
        setUnreadCount(computedUnread);
      }

      return {
        data: items,
        meta: {
          unreadCount: meta.unread_count,
          hasMore: meta.has_more,
          nextCursor: meta.next_cursor,
          limit: meta.limit,
        },
      };
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    // Instant feel: poll refetches keep the previous page rendered.
    placeholderData: keepPreviousData,
  });
}

// ============================================================================
// 3. Mutation Hooks (read-state flips are optimistic-with-rollback per the
// sanctioned exception noted above)
// ============================================================================

/**
 * Mark a single notification as read.
 * Optimistic-with-rollback: the item and the badge counter flip instantly;
 * on failure all caches and the counter restore from snapshots; server
 * truth is re-fetched on settle.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const setUnreadCount = useSessionStore((state) => state.setUnreadCount);

  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string; readAt: string }> => {
      const res = await apiRequest<{ data: { id: string; read_at: string } }>(
        `/notifications/${id}/read`,
        {
          method: 'POST',
        }
      );
      return {
        id: res.data.id,
        readAt: res.data.read_at,
      };
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: dashboardKeys.notifications.all });

      const lists = queryClient.getQueriesData<NotificationListResponse>({
        queryKey: dashboardKeys.notifications.all,
      });
      const prevUnread = useSessionStore.getState().unreadCount;

      const wasUnread = lists.some(([, val]) =>
        val?.data?.some((n) => n.id === id && !n.readAt)
      );

      const now = new Date().toISOString();
      for (const [key, val] of lists) {
        if (!val || !Array.isArray(val.data)) continue;
        queryClient.setQueryData(key, {
          ...val,
          data: val.data.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)),
          meta:
            val.meta && typeof val.meta.unreadCount === 'number' && wasUnread
              ? { ...val.meta, unreadCount: Math.max(0, val.meta.unreadCount - 1) }
              : val.meta,
        });
      }
      if (wasUnread) setUnreadCount(Math.max(0, prevUnread - 1));

      return { lists, prevUnread };
    },
    onError: (_err, _id, context) => {
      if (!context) return;
      for (const [key, val] of context.lists) {
        queryClient.setQueryData(key, val);
      }
      setUnreadCount(context.prevUnread);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.notifications.all,
      });
      // Invalidate /v1/me to keep topbar count accurate
      await queryClient.invalidateQueries({
        queryKey: ['me'],
      });
    },
  });
}

/**
 * Mark all unread notifications as read.
 * Optimistic-with-rollback (same pattern as the single-item mutation).
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const setUnreadCount = useSessionStore((state) => state.setUnreadCount);

  return useMutation({
    mutationFn: async (): Promise<{ updatedCount: number }> => {
      const res = await apiRequest<{ data: { updated_count: number } }>(
        '/notifications/read-all',
        {
          method: 'POST',
        }
      );
      return {
        updatedCount: res.data.updated_count,
      };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: dashboardKeys.notifications.all });

      const lists = queryClient.getQueriesData<NotificationListResponse>({
        queryKey: dashboardKeys.notifications.all,
      });
      const prevUnread = useSessionStore.getState().unreadCount;

      const now = new Date().toISOString();
      for (const [key, val] of lists) {
        if (!val || !Array.isArray(val.data)) continue;
        queryClient.setQueryData(key, {
          ...val,
          data: val.data.map((n) => (n.readAt ? n : { ...n, readAt: now })),
          meta:
            val.meta && typeof val.meta.unreadCount === 'number'
              ? { ...val.meta, unreadCount: 0 }
              : val.meta,
        });
      }
      setUnreadCount(0);

      return { lists, prevUnread };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      for (const [key, val] of context.lists) {
        queryClient.setQueryData(key, val);
      }
      setUnreadCount(context.prevUnread);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.notifications.all,
      });
      await queryClient.invalidateQueries({
        queryKey: ['me'],
      });
    },
  });
}
