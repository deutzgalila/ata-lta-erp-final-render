import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { operationsKeys } from './queryKeys';
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskTimeLogInput,
  TaskStatus,
} from './types';

// ============================================================================
// Queries
// ============================================================================

export function useWorkRequestTasks(
  workRequestId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: operationsKeys.tasks(workRequestId ?? ''),
    queryFn: async () => {
      if (!workRequestId) throw new Error('Work request ID is required');
      const res = await apiRequest<{ data: Task[] }>(
        `/operations/work-requests/${workRequestId}/tasks`
      );
      return res.data;
    },
    enabled: Boolean(workRequestId) && (options?.enabled ?? true),
  });
}

export function useTaskDetail(
  workRequestId: string | undefined,
  taskId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: operationsKeys.taskDetail(workRequestId ?? '', taskId ?? ''),
    queryFn: async () => {
      if (!workRequestId || !taskId) throw new Error('IDs are required');
      const res = await apiRequest<{ data: Task }>(
        `/operations/work-requests/${workRequestId}/tasks/${taskId}`
      );
      return res.data;
    },
    enabled: Boolean(workRequestId && taskId) && (options?.enabled ?? true),
  });
}

export interface TaskRelatedRecords {
  invoices: Array<{
    id: string;
    invoice_number?: string;
    invoiceNumber?: string;
    amount?: number;
    status?: string;
    created_at?: string;
    clients?: { name: string } | null;
  }>;
  disbursements: Array<{
    id: string;
    disbursement_number?: string;
    disbursementNumber?: string;
    category?: string;
    description?: string;
    amount?: number;
    status?: string;
    created_at?: string;
    clients?: { name: string } | null;
  }>;
  transmittals: Array<{
    id: string;
    transmittal_number?: string;
    transmittalNumber?: string;
    tracking_number?: string;
    trackingNumber?: string;
    recipient_name?: string;
    recipientName?: string;
    status?: string;
    created_at?: string;
    clients?: { name: string } | null;
  }>;
}

export function useTaskRelated(
  taskId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['operations', 'tasks', taskId, 'related'],
    queryFn: async () => {
      if (!taskId) throw new Error('Task ID is required');
      const res = await apiRequest<{ data: TaskRelatedRecords }>(
        `/operations/tasks/${taskId}/related`
      );
      return res.data;
    },
    enabled: Boolean(taskId) && (options?.enabled ?? true),
  });
}

// ============================================================================
// Mutations (Zero Optimistic Updates Doctrine)
// ============================================================================

export interface CreateTaskVariables {
  workRequestId?: string;
  data: CreateTaskInput;
}

export interface UpdateTaskVariables {
  workRequestId?: string;
  taskId: string;
  data: UpdateTaskInput;
}

export interface DeleteTaskVariables {
  workRequestId?: string;
  taskId: string;
}

export interface ReorderTasksVariables {
  workRequestId?: string;
  updates: Array<{ taskId: string; displayOrder: number; status?: TaskStatus }>;
}

export interface AddTimeLogsVariables {
  workRequestId?: string;
  taskId: string;
  logs: TaskTimeLogInput[];
}

export function useTaskMutations(boundWorkRequestId?: string) {
  const queryClient = useQueryClient();

  // 1. Create Task
  const createMutation = useMutation<Task, ApiError, CreateTaskVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, data }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      const res = await apiRequest<{ data: Task }>(
        `/operations/work-requests/${workRequestId}/tasks`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    onSuccess: (task, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId || task.workRequestId;
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
    },
  });

  // 2. Update Task (Phase is immutable)
  const updateMutation = useMutation<Task, ApiError, UpdateTaskVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, taskId, data }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      const res = await apiRequest<{ data: Task }>(
        `/operations/work-requests/${workRequestId}/tasks/${taskId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    onSuccess: (task, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId || task.workRequestId;
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.taskDetail(wrId, variables.taskId),
      });
    },
  });

  // 3. Delete Task
  const deleteMutation = useMutation<void, ApiError, DeleteTaskVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, taskId }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      await apiRequest<void>(
        `/operations/work-requests/${workRequestId}/tasks/${taskId}`,
        {
          method: 'DELETE',
        }
      );
    },
    onSuccess: (_res, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId;
      if (wrId) {
        queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
        queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
        queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
      }
    },
  });

  // 4. Reorder Tasks (Intra-phase drag and drop midpoint calculation)
  const reorderMutation = useMutation<Task[], ApiError, ReorderTasksVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, updates }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      const promises = updates.map((u) =>
        apiRequest<{ data: Task }>(
          `/operations/work-requests/${workRequestId}/tasks/${u.taskId}`,
          {
            method: 'PUT',
            body: JSON.stringify({ displayOrder: u.displayOrder, status: u.status }),
          }
        ).then((res) => res.data)
      );
      return Promise.all(promises);
    },
    onSuccess: (_tasks, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId;
      if (wrId) {
        queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
        queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
      }
    },
  });

  // 5. Add Time Logs
  const addTimeLogsMutation = useMutation<Task, ApiError, AddTimeLogsVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, taskId, logs }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      const res = await apiRequest<{ data: Task }>(
        `/operations/work-requests/${workRequestId}/tasks/${taskId}/time-logs`,
        {
          method: 'POST',
          body: JSON.stringify({ logs }),
        }
      );
      return res.data;
    },
    onSuccess: (task, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId || task.workRequestId;
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
    },
  });

  return {
    createTask: async (arg: CreateTaskInput | CreateTaskVariables) => {
      const payload: CreateTaskVariables =
        'title' in arg
          ? { workRequestId: boundWorkRequestId, data: arg as CreateTaskInput }
          : (arg as CreateTaskVariables);
      return createMutation.mutateAsync(payload);
    },
    updateTask: async (
      arg1: string | UpdateTaskVariables,
      arg2?: UpdateTaskInput
    ) => {
      const payload: UpdateTaskVariables =
        typeof arg1 === 'string'
          ? { workRequestId: boundWorkRequestId, taskId: arg1, data: arg2! }
          : arg1;
      return updateMutation.mutateAsync(payload);
    },
    deleteTask: async (arg: string | DeleteTaskVariables) => {
      const payload: DeleteTaskVariables =
        typeof arg === 'string'
          ? { workRequestId: boundWorkRequestId, taskId: arg }
          : arg;
      return deleteMutation.mutateAsync(payload);
    },
    reorderTasks: reorderMutation.mutateAsync,
    addTimeLogs: addTimeLogsMutation.mutateAsync,
    createMutation,
    updateMutation,
    deleteMutation,
    reorderMutation,
    addTimeLogsMutation,
    isPending:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      reorderMutation.isPending ||
      addTimeLogsMutation.isPending,
  };
}
