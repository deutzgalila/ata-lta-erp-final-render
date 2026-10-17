import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore, ACTIVE_ENTITY_STORAGE_KEY } from '@/lib/session';
import { apiRequest } from '@/lib/api';

describe('useSessionStore (Zustand 5 store, Spec §3.1 & Parcel R4)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.getState().clearSession();
  });

  it('starts with a clean unauthenticated initial state', () => {
    const state = useSessionStore.getState();
    expect(state.user).toBeNull();
    expect(state.permissions.size).toBe(0);
    expect(state.activeEntity).toBeNull();
    expect(state.unreadCount).toBe(0);
    expect(state.isAuthenticated).toBe(false);
  });

  it('sets user, permissions Set, activeEntity, and unreadCount on setSession', () => {
    const testUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'dev-admin@ata-lta.ph',
      name: 'Dev Administrator',
      role: 'Admin',
      departments: ['Management'],
      entities: ['ATA', 'LTA'],
    };

    useSessionStore.getState().setSession({
      user: testUser,
      permissions: ['workflow:view', 'billing:view', 'approve_change:*'],
      activeEntity: 'ATA',
      unreadCount: 4,
    });

    const state = useSessionStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.user?.email).toBe('dev-admin@ata-lta.ph');
    expect(state.activeEntity).toBe('ATA');
    expect(state.unreadCount).toBe(4);
    expect(state.permissions instanceof Set).toBe(true);
    expect(state.permissions.has('workflow:view')).toBe(true);
    expect(state.permissions.has('billing:view')).toBe(true);
    expect(state.permissions.has('approve_change:*')).toBe(true);
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('ATA');
  });

  it('defaults activeEntity to user first entity if not provided', () => {
    useSessionStore.getState().setSession({
      user: {
        id: 'user-2',
        email: 'user@test.ph',
        name: 'User Two',
        role: 'Operations',
        departments: [],
        entities: ['LTA'],
      },
      permissions: [],
    });

    const state = useSessionStore.getState();
    expect(state.activeEntity).toBe('LTA');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('LTA');
  });

  it('updates activeEntity via setActiveEntity and writes to localStorage', () => {
    useSessionStore.getState().setActiveEntity('LTA');
    expect(useSessionStore.getState().activeEntity).toBe('LTA');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('LTA');

    useSessionStore.getState().setActiveEntity('ALL');
    expect(useSessionStore.getState().activeEntity).toBe('ALL');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('ALL');
  });

  it('removes erp_active_entity from localStorage when setActiveEntity is called with null', () => {
    useSessionStore.getState().setActiveEntity('ATA');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('ATA');

    useSessionStore.getState().setActiveEntity(null);
    expect(useSessionStore.getState().activeEntity).toBeNull();
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBeNull();
  });

  it('restores stored entity (LTA) from localStorage when activeEntity is undefined', () => {
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, 'LTA');

    useSessionStore.getState().setSession({
      user: {
        id: 'user-3',
        email: 'user3@test.ph',
        name: 'User Three',
        role: 'Operations',
        departments: [],
        entities: ['ATA', 'LTA'],
      },
      permissions: [],
    });

    const state = useSessionStore.getState();
    expect(state.activeEntity).toBe('LTA');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('LTA');
  });

  it('restores stored entity (ALL) from localStorage when activeEntity is undefined', () => {
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, 'ALL');

    useSessionStore.getState().setSession({
      user: {
        id: 'user-4',
        email: 'user4@test.ph',
        name: 'User Four',
        role: 'Operations',
        departments: [],
        entities: ['ATA', 'LTA'],
      },
      permissions: [],
    });

    const state = useSessionStore.getState();
    expect(state.activeEntity).toBe('ALL');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('ALL');
  });

  it('falls back to user.entities[0] when stored entity is not permitted for the user', () => {
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, 'LTA');

    useSessionStore.getState().setSession({
      user: {
        id: 'user-5',
        email: 'user5@test.ph',
        name: 'User Five',
        role: 'Operations',
        departments: [],
        entities: ['ATA'], // LTA not permitted
      },
      permissions: [],
    });

    const state = useSessionStore.getState();
    expect(state.activeEntity).toBe('ATA');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('ATA');
  });

  it('updates unread count via setUnreadCount', () => {
    useSessionStore.getState().setUnreadCount(7);
    expect(useSessionStore.getState().unreadCount).toBe(7);
    // Non-negative guard
    useSessionStore.getState().setUnreadCount(-2);
    expect(useSessionStore.getState().unreadCount).toBe(0);
  });

  it('clears session and removes tokens and erp_active_entity on clearSession', () => {
    localStorage.setItem('erp_access_token', 'test-token');
    localStorage.setItem('erp_refresh_token', 'test-refresh');
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, 'LTA');

    useSessionStore.getState().setSession({
      user: {
        id: 'u-1',
        email: 'test@ata.ph',
        name: 'Test',
        role: 'Admin',
        departments: [],
        entities: ['ATA', 'LTA'],
      },
      permissions: ['workflow:view'],
      activeEntity: 'LTA',
      unreadCount: 3,
    });

    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useSessionStore.getState().activeEntity).toBe('LTA');
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBe('LTA');

    useSessionStore.getState().clearSession();

    const state = useSessionStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.permissions.size).toBe(0);
    expect(state.unreadCount).toBe(0);
    expect(state.activeEntity).toBeNull();
    expect(localStorage.getItem('erp_access_token')).toBeNull();
    expect(localStorage.getItem('erp_refresh_token')).toBeNull();
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBeNull();
  });

  it('removes erp_active_entity if setSession is called with activeEntity: null', () => {
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, 'ATA');

    useSessionStore.getState().setSession({
      user: {
        id: 'u-1',
        email: 'test@ata.ph',
        name: 'Test',
        role: 'Admin',
        departments: [],
        entities: ['ATA'],
      },
      permissions: [],
      activeEntity: null,
    });

    expect(useSessionStore.getState().activeEntity).toBeNull();
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBeNull();
  });
});

describe('apiRequest fetch hardening (Parcel R4)', () => {
  it('includes cache: "no-cache" on HTTP fetch options', async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; options: RequestInit }> = [];

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), options: init || {} });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ success: true }),
      } as Response;
    });

    try {
      await apiRequest('/test-cache');
      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0]?.options.cache).toBe('no-cache');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preserves cache: "no-cache" during 401 retry fetch', async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; options: RequestInit }> = [];
    localStorage.setItem('erp_refresh_token', 'mock-refresh-token');

    let callCount = 0;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), options: init || {} });
      callCount++;
      if (callCount === 1) {
        // Initial request returns 401
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ message: 'Unauthorized' }),
        } as Response;
      }
      if (callCount === 2) {
        // Refresh token endpoint returns new tokens
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            data: { accessToken: 'new-acc', refreshToken: 'new-ref' },
          }),
        } as Response;
      }
      // Retried request returns 200
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ retried: true }),
      } as Response;
    });

    try {
      const res = await apiRequest<{ retried: boolean }>('/secure-resource');
      expect(res).toEqual({ retried: true });
      expect(fetchCalls.length).toBe(3);
      // Initial call
      expect(fetchCalls[0]?.options.cache).toBe('no-cache');
      // Retried call
      expect(fetchCalls[2]?.options.cache).toBe('no-cache');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
