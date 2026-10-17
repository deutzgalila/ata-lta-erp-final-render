import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiRequest, type ApiError } from '@/lib/api';
import { runBlockingAction } from '@/features/operations/components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';
import { adminKeys } from './queryKeys';
import type { AdminUser, CreateUserInput, UpdateUserInput } from './types';

// ============================================================================
// 1. Query Hooks
// ============================================================================

export interface UseUsersListOptions {
  entity?: string | null;
  enabled?: boolean;
}

export function useUsersList(options?: UseUsersListOptions) {
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const effectiveEntity = options?.entity ?? (activeEntity !== 'ALL' ? activeEntity : undefined);

  return useQuery<AdminUser[], ApiError>({
    queryKey: adminKeys.users(effectiveEntity),
    queryFn: async () => {
      const res = await apiRequest<{ data: AdminUser[] }>('/admin/users');
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    // Instant feel: keep previous entity's rows while the next fetch lands.
    placeholderData: keepPreviousData,
  });
}

export function useUserDetail(id: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient();

  return useQuery<AdminUser, ApiError>({
    queryKey: adminKeys.userDetail(id || ''),
    queryFn: async () => {
      if (!id) throw new Error('User ID is required');
      const res = await apiRequest<{ data: AdminUser }>(`/admin/users/${id}`);
      return res.data;
    },
    enabled: Boolean(id) && enabled,
    staleTime: 30 * 1000,
    // Instant feel: seed from the users list cache (bare arrays) while the
    // detail fetch completes. Detail caches live under the same prefix but
    // hold objects, so only array values are considered.
    placeholderData: () => {
      if (!id) return undefined;
      for (const [, list] of queryClient.getQueriesData<unknown>({
        queryKey: adminKeys.allUsers(),
      })) {
        if (!Array.isArray(list)) continue;
        const hit = (list as AdminUser[]).find((u) => u.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
  });
}

// ============================================================================
// 2. Direct Blocking Action Runners (Zero Optimistic Updates)
// ============================================================================

export async function createUserAction(
  data: CreateUserInput,
  activeEntity?: string | null
): Promise<AdminUser> {
  return runBlockingAction<AdminUser>({
    title: 'Creating User Account',
    message: `Provisioning account and permissions for ${data.name} (${data.email})...`,
    actionName: 'Create User',
    successTitle: 'User Created',
    successMessage: `User ${data.name} (${data.email}) created successfully.`,
    apiCall: async () => {
      const res = await apiRequest<{ data: AdminUser }>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    invalidateQueries: [
      adminKeys.allUsers(),
      adminKeys.users(activeEntity),
      ['users'],
    ],
  });
}

export async function updateUserAction(
  id: string,
  data: UpdateUserInput,
  activeEntity?: string | null
): Promise<AdminUser> {
  return runBlockingAction<AdminUser>({
    title: 'Updating User Account',
    message: 'Saving updated profile attributes and department mappings...',
    actionName: 'Update User',
    successTitle: 'User Updated',
    successMessage: 'User profile updated successfully.',
    apiCall: async () => {
      const res = await apiRequest<{ data: AdminUser }>(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    invalidateQueries: [
      adminKeys.allUsers(),
      adminKeys.users(activeEntity),
      adminKeys.userDetail(id),
      ['users'],
    ],
  });
}

export async function disableUserAction(
  id: string,
  userName?: string,
  activeEntity?: string | null
): Promise<void> {
  return runBlockingAction<void>({
    title: 'Disabling User Account',
    message: `Deactivating access for ${userName || id}...`,
    actionName: 'Disable User',
    successTitle: 'User Disabled',
    successMessage: `Account ${userName || id} has been deactivated.`,
    apiCall: async () => {
      await apiRequest<void>(`/admin/users/${id}`, {
        method: 'DELETE',
      });
    },
    invalidateQueries: [
      adminKeys.allUsers(),
      adminKeys.users(activeEntity),
      adminKeys.userDetail(id),
      ['users'],
    ],
  });
}

// ============================================================================
// 3. React Mutation Hook Wrapper
// ============================================================================

export function useUserMutations() {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return {
    createUser: (data: CreateUserInput) => createUserAction(data, activeEntity),
    updateUser: (id: string, data: UpdateUserInput) => updateUserAction(id, data, activeEntity),
    disableUser: (id: string, userName?: string) => disableUserAction(id, userName, activeEntity),
  };
}
