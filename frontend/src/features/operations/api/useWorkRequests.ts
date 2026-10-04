import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { operationsKeys } from './queryKeys';
import type {
  WorkRequest,
  WorkRequestFilters,
  CreateWorkRequestInput,
  UpdateWorkRequestInput,
  WorkRequestListResponse,
  WorkRequestDetailResponse,
  WorkRequestCountsResponse,
  WorkRequestRelatedResponse,
} from './types';

// ============================================================================
// Queries
// ============================================================================

export function useWorkRequests(
  filters?: WorkRequestFilters,
  options?: { enabled?: boolean }
) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: operationsKeys.workRequestsList(activeEntity, filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.phase) params.append('phase', filters.phase);
      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.assigneeId) params.append('assigneeId', filters.assigneeId);
      if (filters?.priority) params.append('priority', filters.priority);
      if (filters?.archived !== undefined) params.append('archived', String(filters.archived));
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.sortBy) params.append('sortBy', filters.sortBy);
      if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
      if (filters?.includeTasks) params.append('includeTasks', String(filters.includeTasks));

      const queryStr = params.toString();
      const path = `/operations/work-requests${queryStr ? `?${queryStr}` : ''}`;
      const res = await apiRequest<WorkRequestListResponse>(path);
      return res;
    },
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

/** Alias to satisfy contract citation */
export const useWorkRequestList = useWorkRequests;

export function useWorkRequestDetail(
  id: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: operationsKeys.workRequestDetail(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('Work request ID is required');
      const res = await apiRequest<WorkRequestDetailResponse>(
        `/operations/work-requests/${id}`
      );
      return res.data;
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useWorkRequestCounts() {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: operationsKeys.workRequestCounts(activeEntity),
    queryFn: async () => {
      const res = await apiRequest<WorkRequestCountsResponse>('/operations/counts');
      return res.data;
    },
  });
}

export function useWorkRequestRelated(
  id: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: operationsKeys.workRequestRelated(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('Work request ID is required');
      const res = await apiRequest<WorkRequestRelatedResponse>(
        `/operations/work-requests/${id}/related`
      );
      return res.data;
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

// ============================================================================
// Mutations (Zero Optimistic Updates Doctrine)
// ============================================================================

export function useWorkRequestMutations() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  // 1. Create Work Request (Single-transaction atomic graph)
  const createMutation = useMutation<WorkRequest, ApiError, CreateWorkRequestInput>({
    mutationFn: async (input) => {
      const res = await apiRequest<WorkRequestDetailResponse>(
        '/operations/work-requests',
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestCounts(activeEntity),
      });
    },
  });

  // 2. Update Work Request
  const updateMutation = useMutation<
    WorkRequest,
    ApiError,
    { id: string; data: UpdateWorkRequestInput }
  >({
    mutationFn: async ({ id, data }) => {
      const res = await apiRequest<WorkRequestDetailResponse>(
        `/operations/work-requests/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestDetail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
    },
  });

  // 3. Archive Work Request (Blocking flow)
  const archiveMutation = useMutation<WorkRequest, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await apiRequest<WorkRequestDetailResponse>(
        `/operations/work-requests/${id}/archive`,
        {
          method: 'POST',
        }
      );
      return res.data;
    },
    onSuccess: (archived) => {
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestDetail(archived.id),
      });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestCounts(activeEntity),
      });
    },
  });

  // 4. Restore / Unarchive Work Request (Blocking flow)
  const restoreMutation = useMutation<WorkRequest, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await apiRequest<WorkRequestDetailResponse>(
        `/operations/work-requests/${id}/unarchive`,
        {
          method: 'POST',
        }
      );
      return res.data;
    },
    onSuccess: (restored) => {
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestDetail(restored.id),
      });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestCounts(activeEntity),
      });
    },
  });

  // 5. Cancel / Delete Work Request
  const cancelMutation = useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiRequest<void>(`/operations/work-requests/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestDetail(id),
      });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestCounts(activeEntity),
      });
    },
  });

  return {
    createWorkRequest: createMutation.mutateAsync,
    updateWorkRequest: updateMutation.mutateAsync,
    archiveWorkRequest: async (arg: string | { id: string }) => {
      const payload = typeof arg === 'string' ? { id: arg } : arg;
      return archiveMutation.mutateAsync(payload);
    },
    restoreWorkRequest: async (arg: string | { id: string }) => {
      const payload = typeof arg === 'string' ? { id: arg } : arg;
      return restoreMutation.mutateAsync(payload);
    },
    cancelWorkRequest: async (arg: string | { id: string }) => {
      const payload = typeof arg === 'string' ? { id: arg } : arg;
      return cancelMutation.mutateAsync(payload);
    },
    createMutation,
    updateMutation,
    archiveMutation,
    restoreMutation,
    cancelMutation,
    isPending:
      createMutation.isPending ||
      updateMutation.isPending ||
      archiveMutation.isPending ||
      restoreMutation.isPending ||
      cancelMutation.isPending,
  };
}
