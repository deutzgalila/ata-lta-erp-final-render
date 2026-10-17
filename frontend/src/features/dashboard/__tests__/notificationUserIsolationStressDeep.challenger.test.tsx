/**
 * Deep Adversarial Challenger Test Suite: User Isolation, UUID Normalization, & Lifecycle Stress
 * (Milestone 3 Challenger 2 - Empirical Challenge Harness)
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

describe('Challenger 2 Deep Verification: User Isolation & Lifecycle Boundary Stress', () => {
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

  describe('Deep User Isolation & UUID RFC 4122 Stress', () => {
    it('handles mixed-case UUID with arbitrary leading/trailing whitespace per RFC 4122', () => {
      const activeUuid = '  a0e69d8c-b817-48f5-85d6-2678d7d9a440  ';
      const payloadUuid = '  A0E69D8C-B817-48F5-85D6-2678D7D9A440  ';

      useSessionStore.setState({
        user: {
          id: activeUuid,
          name: 'Whitespace UUID User',
          email: 'uuid@example.com',
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
      // Filter key is constructed with user.id
      const channel = mockClient.getChannels()[0];
      expect(channel).toBeDefined();

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-uuid-mixed',
            user_id: payloadUuid,
            type: 'wr.qa_reroute',
            payload: { workRequestId: 'wr-1' },
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0]?.id).toBe('n-uuid-mixed');
      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('strictly rejects partial substring user ID attacks (e.g. usr-alice vs usr-alice-admin)', () => {
      queryClient.setQueryData(dashboardKeys.notifications.all, {
        data: [],
        meta: { unreadCount: 0, hasMore: false },
      });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannels()[0];

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-sub-1',
            user_id: 'usr-alice-admin',
            type: 'wr.qa_reroute',
            payload: {},
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-sub-2',
            user_id: 'usr-ali',
            type: 'wr.qa_reroute',
            payload: {},
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      const cached = queryClient.getQueryData<NotificationListResponse>(dashboardKeys.notifications.all);
      expect(cached?.data).toHaveLength(0);
      expect(useSessionStore.getState().unreadCount).toBe(0);
    });

    it('rejects whitespace-only user_id payloads', () => {
      queryClient.setQueryData(dashboardKeys.notifications.all, {
        data: [],
        meta: { unreadCount: 0, hasMore: false },
      });

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannels()[0];

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-whitespace-only',
            user_id: '     ',
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

  describe('Deep Lifecycle & Dynamic Session State Transitions', () => {
    it('properly tears down channel when user logs out (session user becomes null) while mounted', () => {
      const mockClient = supabase as unknown as MockSupabaseClient;

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      // Alice is logged in -> 1 channel active
      expect(mockClient.getChannels()).toHaveLength(1);

      // User logs out
      act(() => {
        useSessionStore.setState({ user: null, unreadCount: 0 });
      });

      // Channel must be cleaned up / removed
      expect(mockClient.getChannels()).toHaveLength(0);
    });

    it('dynamically switches channel subscription when user identity changes from Alice to Bob', () => {
      const mockClient = supabase as unknown as MockSupabaseClient;

      render(<NotificationBellPanel />, { wrapper: createWrapper() });

      expect(mockClient.getChannels()).toHaveLength(1);
      // Switch session to Bob
      act(() => {
        useSessionStore.setState({
          user: {
            id: 'usr-bob',
            name: 'Bob User',
            email: 'bob@example.com',
            role: 'operations_staff',
            departments: [],
            entities: ['ATA'],
          },
          unreadCount: 0,
        });
      });

      // Old channel removed, new channel for Bob created
      expect(mockClient.getChannels()).toHaveLength(1);
      const bobChannel = mockClient.getChannels()[0];

      // Events for Alice emitted on old channel or new channel are rejected
      act(() => {
        bobChannel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-alice-stale',
            user_id: 'usr-alice',
            type: 'wr.qa_reroute',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      expect(useSessionStore.getState().unreadCount).toBe(0);

      // Events for Bob are accepted
      act(() => {
        bobChannel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-bob-fresh',
            user_id: 'usr-bob',
            type: 'wr.qa_reroute',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });

      expect(useSessionStore.getState().unreadCount).toBe(1);
    });

    it('survives 50 rapid mount and unmount cycles without leaking any channels or memory', () => {
      const channelSpy = vi.spyOn(supabase, 'channel');
      const removeChannelSpy = vi.spyOn(supabase, 'removeChannel');

      for (let i = 0; i < 50; i++) {
        const { unmount } = render(<NotificationBellPanel />, { wrapper: createWrapper() });
        unmount();
      }

      expect(channelSpy).toHaveBeenCalledTimes(50);
      expect(removeChannelSpy).toHaveBeenCalledTimes(50);

      const mockClient = supabase as unknown as MockSupabaseClient;
      expect(mockClient.getChannels()).toHaveLength(0);
    });

    it('handles 3 concurrent panels with staggered unmounts, preserving channel until final unmount', () => {
      const mockClient = supabase as unknown as MockSupabaseClient;

      const p1 = render(<NotificationBellPanel />, { wrapper: createWrapper() });
      const p2 = render(<NotificationBellPanel />, { wrapper: createWrapper() });
      const p3 = render(<NotificationBellPanel />, { wrapper: createWrapper() });

      // Multiplexed onto 1 channel
      expect(mockClient.getChannels()).toHaveLength(1);
      const channel = mockClient.getChannels()[0];

      // Unmount p1
      p1.unmount();
      expect(mockClient.getChannels()).toHaveLength(1);

      // Unmount p2
      p2.unmount();
      expect(mockClient.getChannels()).toHaveLength(1);

      // Channel is still live and functioning for p3
      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'INSERT',
          new: {
            id: 'n-survivor-1',
            user_id: 'usr-alice',
            type: 'wr.qa_reroute',
            read_at: null,
            created_at: '2026-10-10T12:00:00Z',
          },
        });
      });
      expect(useSessionStore.getState().unreadCount).toBe(1);

      // Unmount final panel p3
      p3.unmount();
      expect(mockClient.getChannels()).toHaveLength(0);
    });
  });
});
