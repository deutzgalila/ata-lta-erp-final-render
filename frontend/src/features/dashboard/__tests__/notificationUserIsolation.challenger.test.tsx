/**
 * Empirical Challenger Test Suite: User Isolation & Component Lifecycle Stress
 * (SPEC-REALTIME-SYNC-001 §4 Parcel 3, PROJECT.md & Milestone 3 Challenger 2)
 *
 * Verifies:
 * 1. User Isolation Stress:
 *    - Active user usr-alice: broadcast/CDC events destined for usr-bob and user_id: null
 *      leave usr-alice's TanStack query cache and useSessionStore.unreadCount completely untouched.
 *    - Rejection of null, undefined, empty string, and other user IDs across INSERT, UPDATE, DELETE.
 * 2. Case-Insensitive UUID Matching:
 *    - RFC 4122 compliance: matching UUIDs in uppercase vs lowercase for user_id.
 *    - Cross-user UUID mismatch rejection regardless of casing.
 * 3. Component Lifecycle Stress:
 *    - Rapid mount/unmount 20x of NotificationBellPanel without channel or listener leaks.
 *    - Reference counting in activeChannelRegistry under concurrent component mounts.
 *    - Channel teardown when subscriber count drops to 0.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '@/lib/session';
import { supabase, MockSupabaseClient } from '@/lib/supabase';
import { clearChannelRegistryForTesting } from '@/lib/realtime/useEntityRealtimeSync';
import { dashboardKeys } from '../api/queryKeys';
import { NotificationBellPanel } from '../components/NotificationBellPanel';
import type { NotificationListResponse } from '../api/types';

describe('Milestone 3 Challenger: User Isolation & Component Lifecycle Stress', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
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
        id: 'usr-alice',
        name: 'Alice User',
        email: 'alice@example.com',
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

  // =========================================================================
  // Suite 1: User Isolation Stress
  // =========================================================================
  describe('Suite 1: User Isolation Stress (Cross-User & Null user_id Rejection)', () => {
    it('guarantees usr-alice cache and unreadCount remain untouched when event is destined for usr-bob', () => {
      const initialAliceNotif = {
        id: 'n-alice-1',
        userId: 'usr-alice',
        user_id: 'usr-alice',
        type: 'wr.transition_request.received' as const,
        payload: { workRequestId: 'wr-1' },
        readAt: null,
        read_at: null,
        createdAt: '2026-10-10T10:00:00Z',
        created_at: '2026-10-10T10:00:00Z',
      };

      const initialList: NotificationListResponse = {
        data: [initialAliceNotif],
        meta: { unreadCount: 1, hasMore: false },
      };

      queryClient.setQueryData(dashboardKeys.notifications.all, initialList);
      queryClient.setQueryData(dashboardKeys.notifications.list({ limit: 50 }), initialList);
      useSessionStore.setState({ unreadCount: 1 });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');
      expect(channel).toBeDefined();

      // Emit CDC event destined for usr-bob
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-bob-1',
            user_id: 'usr-bob',
            type: 'wr.qa_reroute',
            payload: { workRequestId: 'wr-99' },
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      // Verify usr-alice cache is completely untouched
      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0]?.id).toBe('n-alice-1');
      expect(cached?.data.find((n) => n.id === 'n-bob-1')).toBeUndefined();

      // Verify unreadCount in session store is completely untouched
      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('guarantees usr-alice cache and unreadCount remain untouched when event has user_id: null', () => {
      const initialAliceNotif = {
        id: 'n-alice-existing',
        userId: 'usr-alice',
        user_id: 'usr-alice',
        type: 'wr.transition_request.received' as const,
        payload: { workRequestId: 'wr-1' },
        readAt: null,
        read_at: null,
        createdAt: '2026-10-10T10:00:00Z',
        created_at: '2026-10-10T10:00:00Z',
      };

      const initialList: NotificationListResponse = {
        data: [initialAliceNotif],
        meta: { unreadCount: 1, hasMore: false },
      };

      queryClient.setQueryData(dashboardKeys.notifications.all, initialList);
      queryClient.setQueryData(dashboardKeys.notifications.list({ limit: 50 }), initialList);
      useSessionStore.setState({ unreadCount: 1 });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');
      expect(channel).toBeDefined();

      // Emit broadcast CDC event with user_id: null
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-null-broadcast',
            user_id: null,
            type: 'broadcast.system_alert',
            payload: { message: 'System maintenance' },
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      // Verify usr-alice cache is completely untouched
      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0]?.id).toBe('n-alice-existing');
      expect(cached?.data.find((n) => n.id === 'n-null-broadcast')).toBeUndefined();

      // Verify unreadCount in session store did not increment
      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('rejects events with camelCase userId: null, missing user_id, or empty string user_id', () => {
      const initialAliceNotif = {
        id: 'n-alice-anchor',
        userId: 'usr-alice',
        user_id: 'usr-alice',
        type: 'wr.transition_request.received' as const,
        payload: { workRequestId: 'wr-1' },
        readAt: null,
        read_at: null,
        createdAt: '2026-10-10T10:00:00Z',
        created_at: '2026-10-10T10:00:00Z',
      };

      const initialList: NotificationListResponse = {
        data: [initialAliceNotif],
        meta: { unreadCount: 1, hasMore: false },
      };

      queryClient.setQueryData(dashboardKeys.notifications.all, initialList);
      useSessionStore.setState({ unreadCount: 1 });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');

      // 1. camelCase userId: null
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-camel-null',
            userId: null,
            type: 'broadcast.system_alert',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      // 2. completely missing user_id
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-missing-user',
            type: 'broadcast.system_alert',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      // 3. empty string user_id
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-empty-user',
            user_id: '',
            type: 'broadcast.system_alert',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0]?.id).toBe('n-alice-anchor');
      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('ignores foreign user UPDATE and DELETE transitions without decrementing alice unreadCount', () => {
      const initialAliceNotif = {
        id: 'n-alice-1',
        userId: 'usr-alice',
        user_id: 'usr-alice',
        type: 'wr.transition_request.received' as const,
        payload: { workRequestId: 'wr-1' },
        readAt: null,
        read_at: null,
        createdAt: '2026-10-10T10:00:00Z',
        created_at: '2026-10-10T10:00:00Z',
      };

      queryClient.setQueryData(dashboardKeys.notifications.all, {
        data: [initialAliceNotif],
        meta: { unreadCount: 1, hasMore: false },
      });
      useSessionStore.setState({ unreadCount: 1 });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');

      // Foreign user Bob reads a notification
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          old: { id: 'n-bob-unread', user_id: 'usr-bob', read_at: null },
          new: { id: 'n-bob-unread', user_id: 'usr-bob', read_at: '2026-10-10T12:00:00Z' },
        });
      });

      // Alice's unread counter must NOT decrement
      expect(useSessionStore.getState().unreadCount).toBe(1);

      // Foreign user Bob deletes an unread notification
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'DELETE',
          old: { id: 'n-bob-deleted', user_id: 'usr-bob', read_at: null },
        });
      });

      // Alice's unread counter must STILL be 1
      expect(useSessionStore.getState().unreadCount).toBe(1);
      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
    });
  });

  // =========================================================================
  // Suite 2: Case-Insensitive UUID Matching
  // =========================================================================
  describe('Suite 2: Case-Insensitive UUID Matching (RFC 4122 Compliance)', () => {
    it('accepts incoming uppercase UUID notification when active user has lowercase UUID', () => {
      const lowercaseUuid = 'a0e69d8c-b817-48f5-85d6-2678d7d9a440';
      const uppercaseUuid = 'A0E69D8C-B817-48F5-85D6-2678D7D9A440';

      useSessionStore.setState({
        user: {
          id: lowercaseUuid,
          name: 'Case Test User',
          email: 'case@example.com',
          role: 'operations_staff',
          departments: [],
          entities: ['ATA'],
        },
        unreadCount: 0,
      });

      queryClient.setQueryData(dashboardKeys.notifications.all, {
        data: [],
        meta: { unreadCount: 0, hasMore: false },
      });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');
      expect(channel).toBeDefined();

      // Emit event where payload user_id is UPPERCASE
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-uuid-upper',
            user_id: uppercaseUuid,
            type: 'wr.qa_reroute',
            payload: { workRequestId: 'wr-1' },
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      // The UUID matches RFC 4122 case-insensitively, so it MUST be accepted
      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0]?.id).toBe('n-uuid-upper');
      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('accepts incoming lowercase UUID notification when active user has uppercase UUID', () => {
      const uppercaseUuid = 'B1F70E9D-C928-49F6-96E7-3789E8E0B551';
      const lowercaseUuid = 'b1f70e9d-c928-49f6-96e7-3789e8e0b551';

      useSessionStore.setState({
        user: {
          id: uppercaseUuid,
          name: 'Case Test User 2',
          email: 'case2@example.com',
          role: 'operations_staff',
          departments: [],
          entities: ['ATA'],
        },
        unreadCount: 0,
      });

      queryClient.setQueryData(dashboardKeys.notifications.all, {
        data: [],
        meta: { unreadCount: 0, hasMore: false },
      });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');
      expect(channel).toBeDefined();

      // Emit event where payload user_id is LOWERCASE
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-uuid-lower',
            user_id: lowercaseUuid,
            type: 'wr.qa_reroute',
            payload: { workRequestId: 'wr-2' },
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0]?.id).toBe('n-uuid-lower');
      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('strictly rejects non-matching UUID regardless of casing', () => {
      const activeUuid = 'a0e69d8c-b817-48f5-85d6-2678d7d9a440';
      const foreignUuid = 'C2A81F0E-D039-4AF7-A7F8-4890F9F1C662';

      useSessionStore.setState({
        user: {
          id: activeUuid,
          name: 'Active User',
          email: 'active@example.com',
          role: 'operations_staff',
          departments: [],
          entities: ['ATA'],
        },
        unreadCount: 0,
      });

      queryClient.setQueryData(dashboardKeys.notifications.all, {
        data: [],
        meta: { unreadCount: 0, hasMore: false },
      });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-foreign-uuid',
            user_id: foreignUuid,
            type: 'wr.qa_reroute',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(0);
      expect(useSessionStore.getState().unreadCount).toBe(0);
    });
  });

  // =========================================================================
  // Suite 3: Component Lifecycle Stress & Reference Counting
  // =========================================================================
  describe('Suite 3: Component Lifecycle Stress & Reference Counting', () => {
    it('survives rapid mount and unmount 20 times with clean channel reference count cleanup', async () => {
      const channelSpy = vi.spyOn(supabase, 'channel');
      const removeChannelSpy = vi.spyOn(supabase, 'removeChannel');

      for (let i = 0; i < 20; i++) {
        const { unmount } = render(<NotificationBellPanel />, { wrapper: createWrapper() });
        unmount();
      }

      expect(channelSpy).toHaveBeenCalledTimes(20);
      expect(removeChannelSpy).toHaveBeenCalledTimes(20);

      // Verify no dangling channels in mock client after all 20 unmounts
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channels = mockClient.getChannels ? mockClient.getChannels() : [];
      expect(channels).toHaveLength(0);
    });

    it('correctly multiplexes concurrent NotificationBellPanel mounts and tears down channel only on final unmount', () => {
      const mockClient = supabase as unknown as MockSupabaseClient;

      // Mount Instance A
      const panelA = render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const channel = mockClient.getChannel('cdc_notifications');
      expect(channel).toBeDefined();
      expect(mockClient.getChannels()).toHaveLength(1);

      // Mount Instance B concurrently
      const panelB = render(<NotificationBellPanel />, { wrapper: createWrapper() });

      // Multiplexed: only 1 channel created in mock client
      expect(mockClient.getChannels()).toHaveLength(1);

      // Unmount Instance A
      panelA.unmount();

      // Channel MUST still be active because Instance B is still subscribed!
      expect(mockClient.getChannels()).toHaveLength(1);

      // Emit event: Instance B should still receive it and increment unreadCount
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-multi-1',
            user_id: 'usr-alice',
            type: 'wr.qa_reroute',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      expect(useSessionStore.getState().unreadCount).toBe(1);

      // Unmount Instance B (final unmount)
      panelB.unmount();

      // Now channel count must drop to 0
      expect(mockClient.getChannels()).toHaveLength(0);
    });

    it('cleans up channel listeners properly so unmounted components do not receive subsequent events', () => {
      const panel = render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_notifications');
      expect(channel).toBeDefined();

      panel.unmount();

      // Channel is unsubscribed and removed
      expect(mockClient.getChannels()).toHaveLength(0);
      expect(channel?.status).toBe('CLOSED');
      expect(channel?.getListeners()).toHaveLength(0);
    });
  });
});
