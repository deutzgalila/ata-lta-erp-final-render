import { create } from 'zustand';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  departments: string[];
  entities: string[];
  isActive?: boolean;
  avatarUrl?: string | null;
  preferences?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SessionState {
  user: UserProfile | null;
  permissions: Set<string>;
  activeEntity: string | null;
  unreadCount: number;
  isAuthenticated: boolean;
  isLoading: boolean;

  setSession: (params: {
    user: UserProfile;
    permissions: readonly string[] | string[] | Set<string>;
    activeEntity?: string | null;
    unreadCount?: number;
  }) => void;
  setActiveEntity: (entity: string | null) => void;
  setUnreadCount: (count: number) => void;
  clearSession: () => void;
  setLoading: (isLoading: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  permissions: new Set<string>(),
  activeEntity: null,
  unreadCount: 0,
  isAuthenticated: false,
  isLoading: true,

  setSession: ({ user, permissions, activeEntity, unreadCount }) => {
    const permSet = permissions instanceof Set ? permissions : new Set(permissions);
    const chosenEntity =
      activeEntity ||
      (user.entities.length > 0 ? user.entities[0] ?? null : null);

    set({
      user,
      permissions: permSet,
      activeEntity: chosenEntity,
      unreadCount: unreadCount ?? 0,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  setActiveEntity: (entity) => {
    set({ activeEntity: entity });
  },

  setUnreadCount: (count) => {
    set({ unreadCount: Math.max(0, count) });
  },

  clearSession: () => {
    try {
      localStorage.removeItem('erp_access_token');
      localStorage.removeItem('erp_refresh_token');
    } catch {
      // ignore
    }
    set({
      user: null,
      permissions: new Set<string>(),
      activeEntity: null,
      unreadCount: 0,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },
}));
