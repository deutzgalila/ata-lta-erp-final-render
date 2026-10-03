import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '@/lib/session';

describe('useSessionStore (Zustand 5 store, Spec §3.1)', () => {
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
  });

  it('updates activeEntity via setActiveEntity', () => {
    useSessionStore.getState().setActiveEntity('LTA');
    expect(useSessionStore.getState().activeEntity).toBe('LTA');
    useSessionStore.getState().setActiveEntity('ALL');
    expect(useSessionStore.getState().activeEntity).toBe('ALL');
  });

  it('updates unread count via setUnreadCount', () => {
    useSessionStore.getState().setUnreadCount(7);
    expect(useSessionStore.getState().unreadCount).toBe(7);
    // Non-negative guard
    useSessionStore.getState().setUnreadCount(-2);
    expect(useSessionStore.getState().unreadCount).toBe(0);
  });

  it('clears session and removes tokens on clearSession', () => {
    localStorage.setItem('erp_access_token', 'test-token');
    localStorage.setItem('erp_refresh_token', 'test-refresh');

    useSessionStore.getState().setSession({
      user: {
        id: 'u-1',
        email: 'test@ata.ph',
        name: 'Test',
        role: 'Admin',
        departments: [],
        entities: ['ATA'],
      },
      permissions: ['workflow:view'],
      unreadCount: 3,
    });

    expect(useSessionStore.getState().isAuthenticated).toBe(true);

    useSessionStore.getState().clearSession();

    const state = useSessionStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.permissions.size).toBe(0);
    expect(state.unreadCount).toBe(0);
    expect(state.activeEntity).toBeNull();
    expect(localStorage.getItem('erp_access_token')).toBeNull();
    expect(localStorage.getItem('erp_refresh_token')).toBeNull();
  });
});
