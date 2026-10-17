/**
 * Empirical Stress Test Suite: Notification Stream Reconciliation
 * Target: useEntityRealtimeSync.ts & useNotifications.ts
 *
 * Challenger: M3 Challenger 1 (Notification Stream Stress Harness)
 * Specifications: SPEC-REALTIME-SYNC-001 §4 Parcel 3, PROJECT.md §1 & §4
 *
 * Test Scenarios:
 * 1. Rapid bursts of 50+ concurrent incoming notifications (INSERT):
 *    - All records prepended to list cache.
 *    - useSessionStore.unreadCount increments accurately.
 *    - Mixed read/unread bursts: only unread increments counter.
 *    - User isolation: drops foreign user notifications under burst.
 * 2. High-concurrency UPDATE events (unread -> read):
 *    - Transitioning unread to read decrements unreadCount.
 *    - Monotonic lower bound: counter never drops below 0.
 * 3. Updating ALREADY-READ notifications (read -> read):
 *    - read -> read UPDATE does NOT decrement unreadCount.
 * 4. High-concurrency DELETE / soft-delete events:
 *    - Deleting unread records decrements count.
 *    - Deleting read records does NOT decrement unread count.
 * 5. Complex interleaved 100-event stream chaos test with empirical mathematical oracle.
 * 6. Multi-query synchronization without session counter duplication.
 *
 * STRICT INVARIANTS:
 * - Zero Playwright dependencies or browser runners.
 * - Zero hardcoded secrets.
 * - Strict TypeScript 5.7+ compliance (no any types).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '@/lib/session';
import { supabase, MockRealtimeChannel } from '@/lib/supabase';
import {
  clearChannelRegistryForTesting,
} from '@/lib/realtime/useEntityRealtimeSync';
import { dashboardKeys } from '../api/queryKeys';
import { useNotificationRealtimeSync } from '../api/useNotifications';
import type {
  NotificationListResponse,
  NotificationItem,
} from '../api/types';

describe('Empirical Challenger Harness: Notification Stream Reconciliation Stress Suite', () => {
  let queryClient: QueryClient;
  const TARGET_USER_ID = 'usr-challenger-stress-1';

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    localStorage.clear();
    clearChannelRegistryForTesting();

    useSessionStore.setState({
      user: {
        id: TARGET_USER_ID,
        name: 'Stress Test User',
        email: 'stress@example.com',
        role: 'operations_staff',
        departments: [],
        entities: ['ATA'],
      },
      permissions: new Set(['operations:view']),
      activeEntity: 'ATA',
      unreadCount: 0,
    });
  });

  afterEach(async () => {
    await supabase.removeAllChannels();
    clearChannelRegistryForTesting();
    queryClient.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Rapid Bursts of 50+ Concurrent Incoming Notifications (INSERT)
  // ==========================================================================
  describe('Suite 1: Rapid Bursts of 50+ Concurrent Incoming Notifications (INSERT)', () => {
    it('1.1 handles 60 concurrent unread notification INSERTs via live channel broadcast', async () => {
      // Seed list query with initial state: 5 existing notifications (3 unread, 2 read)
      const initialItems: NotificationItem[] = [
        {
          id: 'n-init-1',
          userId: TARGET_USER_ID,
          type: 'wr.qa_reroute',
          payload: { workRequestId: 'wr-1' },
          readAt: null,
          createdAt: '2026-10-10T08:00:00Z',
        },
        {
          id: 'n-init-2',
          userId: TARGET_USER_ID,
          type: 'wr.qa_reroute',
          payload: { workRequestId: 'wr-2' },
          readAt: null,
          createdAt: '2026-10-10T08:05:00Z',
        },
        {
          id: 'n-init-3',
          userId: TARGET_USER_ID,
          type: 'wr.transition_request.resolved',
          payload: { workRequestId: 'wr-3' },
          readAt: '2026-10-10T08:10:00Z',
          createdAt: '2026-10-10T08:10:00Z',
        },
        {
          id: 'n-init-4',
          userId: TARGET_USER_ID,
          type: 'wr.qa_reroute',
          payload: { workRequestId: 'wr-4' },
          readAt: null,
          createdAt: '2026-10-10T08:15:00Z',
        },
        {
          id: 'n-init-5',
          userId: TARGET_USER_ID,
          type: 'pending_request.resolved',
          payload: { workRequestId: 'wr-5' },
          readAt: '2026-10-10T08:20:00Z',
          createdAt: '2026-10-10T08:20:00Z',
        },
      ];

      const listKey = dashboardKeys.notifications.all;
      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: initialItems,
        meta: { unreadCount: 3, hasMore: false },
      });
      useSessionStore.setState({ unreadCount: 3 });

      // Mount hook to establish live Supabase Realtime channel subscription
      const { unmount } = renderHook(() => useNotificationRealtimeSync(), {
        wrapper: createWrapper(),
      });

      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      // Burst of 60 rapid concurrent unread INSERT events
      const BURST_COUNT = 60;
      act(() => {
        for (let i = 1; i <= BURST_COUNT; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-burst-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: { workRequestId: `wr-burst-${i}` },
              read_at: null,
              created_at: new Date(1760000000000 + i * 1000).toISOString(),
            },
          });
        }
      });

      // Verify session store reflects accurate unread counter (3 initial + 60 burst = 63)
      expect(useSessionStore.getState().unreadCount).toBe(63);

      // Verify TanStack cache contains all 65 records prepended correctly
      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached).toBeDefined();
      expect(cached?.data).toHaveLength(65);
      expect(cached?.meta.unreadCount).toBe(63);

      // Verify the most recently prepended item is at index 0
      expect(cached?.data[0]?.id).toBe(`notif-burst-${BURST_COUNT}`);

      unmount();
    });

    it('1.2 handles a mixed 60-event burst: 35 unread + 25 already-read notifications', () => {
      const listKey = dashboardKeys.notifications.all;
      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [],
        meta: { unreadCount: 0 },
      });
      useSessionStore.setState({ unreadCount: 0 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        // 35 unread notifications
        for (let i = 1; i <= 35; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-unread-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: { workRequestId: `wr-${i}` },
              read_at: null,
              created_at: '2026-10-10T10:00:00Z',
            },
          });
        }

        // 25 already-read notifications
        for (let i = 1; i <= 25; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-read-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.transition_request.resolved',
              payload: { workRequestId: `wr-${i}` },
              read_at: '2026-10-10T09:00:00Z',
              created_at: '2026-10-10T09:00:00Z',
            },
          });
        }
      });

      // All 60 notifications enter the cache
      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.data).toHaveLength(60);

      // Crucial: Only the 35 unread notifications increment unreadCount!
      expect(cached?.meta.unreadCount).toBe(35);
      expect(useSessionStore.getState().unreadCount).toBe(35);
    });

    it('1.3 isolates tenant and user: drops foreign user notifications during concurrent burst', () => {
      const listKey = dashboardKeys.notifications.all;
      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [],
        meta: { unreadCount: 0 },
      });
      useSessionStore.setState({ unreadCount: 0 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        // 30 notifications for TARGET_USER_ID
        for (let i = 1; i <= 30; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-target-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: {},
              read_at: null,
              created_at: '2026-10-10T10:00:00Z',
            },
          });
        }

        // 30 notifications for a different foreign user
        for (let i = 1; i <= 30; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-foreign-${i}`,
              user_id: 'usr-different-alien-user-99',
              type: 'wr.qa_reroute',
              payload: {},
              read_at: null,
              created_at: '2026-10-10T10:00:00Z',
            },
          });
        }
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      // Only target user's 30 notifications must exist
      expect(cached?.data).toHaveLength(30);
      expect(cached?.data.every((n) => (n.userId ?? (n as unknown as Record<string, unknown>).user_id) === TARGET_USER_ID)).toBe(true);
      expect(cached?.meta.unreadCount).toBe(30);
      expect(useSessionStore.getState().unreadCount).toBe(30);
    });

    it('1.4 preserves idempotency and session counter sync under duplicate INSERT events', () => {
      const listKey = dashboardKeys.notifications.all;
      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [],
        meta: { unreadCount: 0 },
      });
      useSessionStore.setState({ unreadCount: 0 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        // Emit 5 unique IDs, each emitted twice (total 10 events)
        for (let i = 1; i <= 5; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-dup-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: {},
              read_at: null,
              created_at: '2026-10-10T10:00:00Z',
            },
          });
          // Immediate duplicate replay
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `notif-dup-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: {},
              read_at: null,
              created_at: '2026-10-10T10:00:00Z',
            },
          });
        }
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      // Cache correctly deduplicates:
      expect(cached?.data).toHaveLength(5);
      expect(cached?.meta.unreadCount).toBe(5);

      // Session store counter must match cache unreadCount (5, NOT 10):
      expect(useSessionStore.getState().unreadCount).toBe(5);
    });

    it('1.5 prevents multi-subscriber amplification when multiple components mount the sync hook', () => {
      const listKey = dashboardKeys.notifications.all;
      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [],
        meta: { unreadCount: 0 },
      });
      useSessionStore.setState({ unreadCount: 0 });

      // Component A mounts sync hook
      const hookA = renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      // Component B mounts same sync hook (e.g. Bell in Topbar + Inbox in page)
      const hookB = renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });

      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        // A single notification arrives on the shared channel
        channel.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'notif-multi-sub-1',
            user_id: TARGET_USER_ID,
            type: 'wr.qa_reroute',
            payload: {},
            read_at: null,
            created_at: '2026-10-10T10:00:00Z',
          },
        });
      });

      // Session store unreadCount MUST be 1, NOT multiplied by subscriber count (2)!
      expect(useSessionStore.getState().unreadCount).toBe(1);

      hookA.unmount();
      hookB.unmount();
    });
  });

  // ==========================================================================
  // Suite 2: High-Concurrency UPDATE Events (Unread -> Read Transitions)
  // ==========================================================================
  describe('Suite 2: High-Concurrency UPDATE Events (Unread -> Read Transitions)', () => {
    it('2.1 accurately decrements unreadCount to 0 during 50 concurrent unread -> read transitions', () => {
      const listKey = dashboardKeys.notifications.all;
      const count = 50;

      // Seed 50 unread notifications
      const seeded: NotificationItem[] = Array.from({ length: count }, (_, idx) => ({
        id: `notif-trans-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute' as const,
        payload: { workRequestId: `wr-${idx + 1}` },
        readAt: null,
        createdAt: '2026-10-10T10:00:00Z',
      }));

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: seeded,
        meta: { unreadCount: count },
      });
      useSessionStore.setState({ unreadCount: count });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      // Emit 50 concurrent UPDATE transitions (read_at set)
      act(() => {
        for (let i = 1; i <= count; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `notif-trans-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: { workRequestId: `wr-${i}` },
              read_at: '2026-10-10T11:00:00Z',
              created_at: '2026-10-10T10:00:00Z',
            },
            old: {
              id: `notif-trans-${i}`,
              read_at: null,
            },
          });
        }
      });

      // Verify unread count decremented accurately to exactly 0
      expect(useSessionStore.getState().unreadCount).toBe(0);

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.meta.unreadCount).toBe(0);
      expect(cached?.data).toHaveLength(count);

      // Verify all items in cache now have readAt populated
      const allRead = cached?.data.every((item) => Boolean(item.readAt || (item as unknown as Record<string, unknown>).read_at));
      expect(allRead).toBe(true);
    });

    it('2.2 enforces monotonic lower bound: unreadCount never drops below 0 on excess transitions', () => {
      const listKey = dashboardKeys.notifications.all;

      // Seed with 5 unread items
      const seeded: NotificationItem[] = Array.from({ length: 5 }, (_, idx) => ({
        id: `notif-bound-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute' as const,
        payload: {},
        readAt: null,
        createdAt: '2026-10-10T10:00:00Z',
      }));

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: seeded,
        meta: { unreadCount: 5 },
      });
      useSessionStore.setState({ unreadCount: 5 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      // Emit 15 UPDATE events (5 valid transitions + 10 excess/orphan transitions)
      act(() => {
        for (let i = 1; i <= 15; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `notif-bound-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: {},
              read_at: '2026-10-10T11:30:00Z',
            },
            old: {
              id: `notif-bound-${i}`,
              read_at: null,
            },
          });
        }
      });

      // unreadCount must strictly be 0, never negative (-1, -10, etc.)
      expect(useSessionStore.getState().unreadCount).toBe(0);

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.meta.unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 3: Updating ALREADY-READ Notifications (Read -> Read)
  // ==========================================================================
  describe('Suite 3: Updating ALREADY-READ Notifications (Read -> Read)', () => {
    it('3.1 ensures 50 concurrent updates to ALREADY-READ notifications do NOT decrement unreadCount', () => {
      const listKey = dashboardKeys.notifications.all;
      const count = 50;

      // Seed 50 ALREADY-READ notifications
      const seeded: NotificationItem[] = Array.from({ length: count }, (_, idx) => ({
        id: `notif-already-read-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.transition_request.resolved' as const,
        payload: { workRequestId: `wr-${idx + 1}`, attempt: 1 },
        readAt: '2026-10-09T08:00:00Z',
        createdAt: '2026-10-09T08:00:00Z',
      }));

      // Initial unread count is 14 (representing unrelated active unread notifications)
      const INITIAL_UNREAD = 14;
      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: seeded,
        meta: { unreadCount: INITIAL_UNREAD },
      });
      useSessionStore.setState({ unreadCount: INITIAL_UNREAD });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      // Emit 50 UPDATE events on these read notifications (updating payload/metadata while staying read)
      act(() => {
        for (let i = 1; i <= count; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `notif-already-read-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.transition_request.resolved',
              payload: { workRequestId: `wr-${i}`, attempt: 2, note: 're-acknowledged' },
              read_at: '2026-10-09T08:00:00Z',
              created_at: '2026-10-09T08:00:00Z',
            },
            old: {
              id: `notif-already-read-${i}`,
              read_at: '2026-10-09T08:00:00Z',
            },
          });
        }
      });

      // Session store unreadCount MUST NOT be decremented — it must stay exactly INITIAL_UNREAD
      expect(useSessionStore.getState().unreadCount).toBe(INITIAL_UNREAD);

      // TanStack cache meta unreadCount must also remain intact
      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.meta.unreadCount).toBe(INITIAL_UNREAD);

      // Verify that the payload update was still applied to the cached items
      const firstItem = cached?.data.find((n) => n.id === 'notif-already-read-1');
      expect((firstItem?.payload as Record<string, unknown>)?.attempt).toBe(2);
    });

    it('3.2 handles idempotent duplicate read-state flips without double-decrementing', () => {
      const listKey = dashboardKeys.notifications.all;
      const initialItem: NotificationItem = {
        id: 'notif-idem-1',
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute',
        payload: {},
        readAt: null,
        createdAt: '2026-10-10T09:00:00Z',
      };

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [initialItem],
        meta: { unreadCount: 1 },
      });
      useSessionStore.setState({ unreadCount: 1 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        // Step 1: First read transition (unread -> read)
        channel.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'notif-idem-1',
            user_id: TARGET_USER_ID,
            type: 'wr.qa_reroute',
            payload: {},
            read_at: '2026-10-10T10:00:00Z',
          },
          old: {
            id: 'notif-idem-1',
            read_at: null,
          },
        });
      });

      expect(useSessionStore.getState().unreadCount).toBe(0);

      act(() => {
        // Step 2: Duplicate read transition arriving later (read -> read)
        channel.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'notif-idem-1',
            user_id: TARGET_USER_ID,
            type: 'wr.qa_reroute',
            payload: {},
            read_at: '2026-10-10T10:00:00Z',
          },
          old: {
            id: 'notif-idem-1',
            read_at: '2026-10-10T10:00:00Z',
          },
        });
      });

      // Must remain 0, never -1
      expect(useSessionStore.getState().unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 4: High-Concurrency DELETE and Soft-Delete Events
  // ==========================================================================
  describe('Suite 4: High-Concurrency DELETE and Soft-Delete Events', () => {
    it('4.1 decrements unreadCount to 0 upon 50 concurrent hard DELETE events of unread notifications', () => {
      const listKey = dashboardKeys.notifications.all;
      const count = 50;

      const seeded: NotificationItem[] = Array.from({ length: count }, (_, idx) => ({
        id: `notif-del-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute' as const,
        payload: {},
        readAt: null,
        createdAt: '2026-10-10T10:00:00Z',
      }));

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: seeded,
        meta: { unreadCount: count },
      });
      useSessionStore.setState({ unreadCount: count });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        for (let i = 1; i <= count; i++) {
          channel.emit('postgres_changes', {
            eventType: 'DELETE',
            old: {
              id: `notif-del-${i}`,
              user_id: TARGET_USER_ID,
              read_at: null,
            },
          });
        }
      });

      expect(useSessionStore.getState().unreadCount).toBe(0);

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.data).toHaveLength(0);
      expect(cached?.meta.unreadCount).toBe(0);
    });

    it('4.2 decrements unreadCount to 0 upon 50 concurrent soft-delete events of unread notifications', () => {
      const listKey = dashboardKeys.notifications.all;
      const count = 50;

      const seeded: NotificationItem[] = Array.from({ length: count }, (_, idx) => ({
        id: `notif-softdel-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute' as const,
        payload: {},
        readAt: null,
        createdAt: '2026-10-10T10:00:00Z',
      }));

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: seeded,
        meta: { unreadCount: count },
      });
      useSessionStore.setState({ unreadCount: count });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        for (let i = 1; i <= count; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `notif-softdel-${i}`,
              user_id: TARGET_USER_ID,
              deleted_at: '2026-10-10T12:00:00Z',
              read_at: null,
            },
            old: {
              id: `notif-softdel-${i}`,
              read_at: null,
            },
          });
        }
      });

      expect(useSessionStore.getState().unreadCount).toBe(0);

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.data).toHaveLength(0);
      expect(cached?.meta.unreadCount).toBe(0);
    });

    it('4.3 verifies that deleting ALREADY-READ notifications does NOT decrement unreadCount', () => {
      const listKey = dashboardKeys.notifications.all;

      // Seed 40 read notifications + 15 unread notifications
      const readItems: NotificationItem[] = Array.from({ length: 40 }, (_, idx) => ({
        id: `notif-read-item-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.transition_request.resolved' as const,
        payload: {},
        readAt: '2026-10-09T00:00:00Z',
        createdAt: '2026-10-09T00:00:00Z',
      }));

      const unreadItems: NotificationItem[] = Array.from({ length: 15 }, (_, idx) => ({
        id: `notif-unread-item-${idx + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute' as const,
        payload: {},
        readAt: null,
        createdAt: '2026-10-10T00:00:00Z',
      }));

      const initialUnread = 15;

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [...readItems, ...unreadItems],
        meta: { unreadCount: initialUnread },
      });
      useSessionStore.setState({ unreadCount: initialUnread });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      // Delete 20 via hard DELETE and 20 via soft-delete (all targeting the 40 READ items)
      act(() => {
        // First 20: Hard delete
        for (let i = 1; i <= 20; i++) {
          channel.emit('postgres_changes', {
            eventType: 'DELETE',
            old: {
              id: `notif-read-item-${i}`,
              user_id: TARGET_USER_ID,
              read_at: '2026-10-09T00:00:00Z',
            },
          });
        }

        // Remaining 20: Soft delete
        for (let i = 21; i <= 40; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `notif-read-item-${i}`,
              user_id: TARGET_USER_ID,
              deleted_at: '2026-10-10T14:00:00Z',
              read_at: '2026-10-09T00:00:00Z',
            },
            old: {
              id: `notif-read-item-${i}`,
              read_at: '2026-10-09T00:00:00Z',
            },
          });
        }
      });

      // All 40 read items must be evicted, leaving 15 unread items
      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.data).toHaveLength(15);

      // unreadCount MUST remain strictly 15!
      expect(cached?.meta.unreadCount).toBe(15);
      expect(useSessionStore.getState().unreadCount).toBe(15);
    });

    it('4.4 enforces monotonic lower bound on delete: unreadCount never drops below 0 when deleting at 0', () => {
      const listKey = dashboardKeys.notifications.all;
      const seeded: NotificationItem = {
        id: 'notif-del-zero',
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute',
        payload: {},
        readAt: null,
        createdAt: '2026-10-10T10:00:00Z',
      };

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [seeded],
        meta: { unreadCount: 0 },
      });
      useSessionStore.setState({ unreadCount: 0 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      act(() => {
        channel.emit('postgres_changes', {
          eventType: 'DELETE',
          old: {
            id: 'notif-del-zero',
            user_id: TARGET_USER_ID,
            read_at: null,
          },
        });
      });

      expect(useSessionStore.getState().unreadCount).toBe(0);
      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.meta.unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 5: Complex Interleaved 100-Event Stream Chaos Test (Empirical Oracle)
  // ==========================================================================
  describe('Suite 5: Complex Interleaved 100-Event Stream Chaos Test', () => {
    it('5.1 executes a 100-event interleaved burst and matches mathematical oracle', () => {
      const listKey = dashboardKeys.notifications.all;

      // Initial state:
      // 10 unread items ('seed-unread-1' to 'seed-unread-10')
      // 10 read items ('seed-read-1' to 'seed-read-10')
      // Initial unreadCount = 10, initial total = 20
      const initialUnread: NotificationItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `seed-unread-${i + 1}`,
        userId: TARGET_USER_ID,
        type: 'wr.qa_reroute' as const,
        payload: {},
        readAt: null,
        createdAt: '2026-10-09T10:00:00Z',
      }));

      const initialRead: NotificationItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `seed-read-${i + 1}`,
        userId: TARGET_USER_ID,
        type: 'pending_request.resolved' as const,
        payload: {},
        readAt: '2026-10-09T09:00:00Z',
        createdAt: '2026-10-09T09:00:00Z',
      }));

      queryClient.setQueryData<NotificationListResponse>(listKey, {
        data: [...initialUnread, ...initialRead],
        meta: { unreadCount: 10 },
      });
      useSessionStore.setState({ unreadCount: 10 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      /**
       * Mathematical Oracle Breakdown:
       * Starting unreadCount: 10
       * Starting total items: 20
       *
       * Event stream (100 events):
       * 1. INSERT 40 new unread notifications:
       *    unreadCount delta: +40, total delta: +40
       * 2. INSERT 20 new already-read notifications:
       *    unreadCount delta: +0,  total delta: +20
       * 3. UPDATE 15 unread notifications (5 from seed, 10 from newly inserted):
       *    unreadCount delta: -15, total delta: 0
       * 4. UPDATE 10 read notifications (seed-read-1..10):
       *    unreadCount delta: 0,   total delta: 0
       * 5. DELETE 10 unread notifications (3 from seed, 7 from newly inserted):
       *    unreadCount delta: -10, total delta: -10
       * 6. DELETE 5 read notifications:
       *    unreadCount delta: 0,   total delta: -5
       *
       * Expected final unreadCount: 10 + 40 + 0 - 15 + 0 - 10 + 0 = 25
       * Expected final total items: 20 + 40 + 20 + 0 + 0 - 10 - 5 = 65
       */

      act(() => {
        // 1. 40 unread INSERTs
        for (let i = 1; i <= 40; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `chaos-unread-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: { idx: i },
              read_at: null,
              created_at: '2026-10-10T12:00:00Z',
            },
          });
        }

        // 2. 20 read INSERTs
        for (let i = 1; i <= 20; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `chaos-read-${i}`,
              user_id: TARGET_USER_ID,
              type: 'pending_request.resolved',
              payload: { idx: i },
              read_at: '2026-10-10T11:00:00Z',
              created_at: '2026-10-10T11:00:00Z',
            },
          });
        }

        // 3. 15 UPDATEs: unread -> read (5 seed + 10 chaos)
        for (let i = 1; i <= 5; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `seed-unread-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: {},
              read_at: '2026-10-10T13:00:00Z',
            },
            old: {
              id: `seed-unread-${i}`,
              read_at: null,
            },
          });
        }
        for (let i = 1; i <= 10; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `chaos-unread-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: { idx: i },
              read_at: '2026-10-10T13:00:00Z',
            },
            old: {
              id: `chaos-unread-${i}`,
              read_at: null,
            },
          });
        }

        // 4. 10 UPDATEs: read -> read (seed-read-1..10)
        for (let i = 1; i <= 10; i++) {
          channel.emit('postgres_changes', {
            eventType: 'UPDATE',
            new: {
              id: `seed-read-${i}`,
              user_id: TARGET_USER_ID,
              type: 'pending_request.resolved',
              payload: { touched: true },
              read_at: '2026-10-09T09:00:00Z',
            },
            old: {
              id: `seed-read-${i}`,
              read_at: '2026-10-09T09:00:00Z',
            },
          });
        }

        // 5. 10 DELETEs: unread items (seed-unread-6..8 [3 items] + chaos-unread-11..17 [7 items])
        for (let i = 6; i <= 8; i++) {
          channel.emit('postgres_changes', {
            eventType: 'DELETE',
            old: {
              id: `seed-unread-${i}`,
              user_id: TARGET_USER_ID,
              read_at: null,
            },
          });
        }
        for (let i = 11; i <= 17; i++) {
          channel.emit('postgres_changes', {
            eventType: 'DELETE',
            old: {
              id: `chaos-unread-${i}`,
              user_id: TARGET_USER_ID,
              read_at: null,
            },
          });
        }

        // 6. 5 DELETEs: read items (seed-read-1..5)
        for (let i = 1; i <= 5; i++) {
          channel.emit('postgres_changes', {
            eventType: 'DELETE',
            old: {
              id: `seed-read-${i}`,
              user_id: TARGET_USER_ID,
              read_at: '2026-10-09T09:00:00Z',
            },
          });
        }
      });

      // Verify empirical oracle matches exactly
      expect(useSessionStore.getState().unreadCount).toBe(25);

      const cached = queryClient.getQueryData<NotificationListResponse>(listKey);
      expect(cached?.meta.unreadCount).toBe(25);
      expect(cached?.data).toHaveLength(65);
    });

    it('5.2 synchronizes multiple matching queries under listRootKey without session count duplication', () => {
      // Query 1: Root notifications
      const query1Key = dashboardKeys.notifications.all;
      // Query 2: Sub-query with pagination params
      const query2Key = dashboardKeys.notifications.list({ limit: 50 });

      queryClient.setQueryData<NotificationListResponse>(query1Key, {
        data: [],
        meta: { unreadCount: 0 },
      });
      queryClient.setQueryData<NotificationListResponse>(query2Key, {
        data: [],
        meta: { unreadCount: 0 },
      });
      useSessionStore.setState({ unreadCount: 0 });

      renderHook(() => useNotificationRealtimeSync(), { wrapper: createWrapper() });
      const channel = supabase.channel('cdc_notifications') as unknown as MockRealtimeChannel;

      // Burst of 50 unread notifications
      act(() => {
        for (let i = 1; i <= 50; i++) {
          channel.emit('postgres_changes', {
            eventType: 'INSERT',
            new: {
              id: `multi-q-${i}`,
              user_id: TARGET_USER_ID,
              type: 'wr.qa_reroute',
              payload: {},
              read_at: null,
              created_at: '2026-10-10T12:00:00Z',
            },
          });
        }
      });

      // Both query caches must be populated
      const q1Data = queryClient.getQueryData<NotificationListResponse>(query1Key);
      const q2Data = queryClient.getQueryData<NotificationListResponse>(query2Key);

      expect(q1Data?.data).toHaveLength(50);
      expect(q2Data?.data).toHaveLength(50);
      expect(q1Data?.meta.unreadCount).toBe(50);
      expect(q2Data?.meta.unreadCount).toBe(50);

      // Crucial: useSessionStore unreadCount must be 50, NOT 100!
      // (Having multiple matching queries in TanStack cache must not cause duplicate increments per event)
      expect(useSessionStore.getState().unreadCount).toBe(50);
    });
  });
});
