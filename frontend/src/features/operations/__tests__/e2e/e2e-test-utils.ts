import { QueryClient } from '@tanstack/react-query';
import { useSessionStore, type UserProfile } from '@/lib/session';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function setupTestSession(user: Partial<UserProfile> = {}, permissions: string[] = []): void {
  useSessionStore.getState().setSession({
    user: {
      id: user.id || 'u-admin-1',
      email: user.email || 'admin@ata-lta.ph',
      name: user.name || 'Admin User',
      role: user.role || 'Admin',
      departments: user.departments || ['Operations'],
      entities: user.entities || ['ATA', 'LTA'],
    },
    permissions,
  });
}
