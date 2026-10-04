/**
 * TanStack Query Hooks for Notifications API Contract (notifications@2.0.0)
 *
 * Rules:
 * - 30s polling (no websockets)
 * - R2: No optimistic updates (mutate -> await -> invalidate)
 * - R3: Verbatim RFC 7807 error surfacing
 * - Citation: docs/api-contracts/modules/notifications.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  });
}

// ============================================================================
// 3. Mutation Hooks (Strict Blocking Flow)
// ============================================================================

/**
 * Mark a single notification as read.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const setUnreadCount = useSessionStore((state) => state.setUnreadCount);
  const unreadCount = useSessionStore((state) => state.unreadCount);

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
    onSuccess: async () => {
      // Decrement unread count defensively
      setUnreadCount(Math.max(0, unreadCount - 1));

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
    onSuccess: async () => {
      setUnreadCount(0);
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.notifications.all,
      });
      await queryClient.invalidateQueries({
        queryKey: ['me'],
      });
    },
  });
}
