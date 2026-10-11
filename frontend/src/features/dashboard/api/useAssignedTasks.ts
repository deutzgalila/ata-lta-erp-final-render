/**
 * Hook to discover and retrieve assigned tasks for the Log-Time Task Picker
 *
 * Scoping Rule (Spec §4.2):
 * - Scoped to tasks assigned to the current user (via `assigneeId` or `assignees` array)
 * - Sources tasks from active Work Requests (`/v1/operations/work-requests?archived=false`)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { isTaskAssignee } from '@/features/operations/lib/taskScope';
import { dashboardKeys } from './queryKeys';
import type { AssignableTaskOption } from './types';
import type { WorkRequest, Task } from '@/features/operations/api/types';

export interface UseAssignedTasksOptions {
  allTasksForAdmin?: boolean;
}

export function useAssignedTasks(options: UseAssignedTasksOptions = {}) {
  const { allTasksForAdmin = false } = options;
  const user = useSessionStore((state) => state.user);
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const userId = user?.id;
  const permissions = useSessionStore((state) => state.permissions);
  const canEditAll = hasPermission(permissions, 'timelog:edit_all');

  const effectiveAllTasksForAdmin = Boolean(allTasksForAdmin && canEditAll);
  const queryKey = effectiveAllTasksForAdmin
    ? [...dashboardKeys.assignedTasks.scoped(userId), activeEntity, { allTasksForAdmin: true }]
    : [...dashboardKeys.assignedTasks.scoped(userId), activeEntity];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<AssignableTaskOption[]> => {
      // The operations list omits tasks unless explicitly requested. Fetch every page.
      const workRequests: WorkRequest[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await apiRequest<{ data: WorkRequest[]; meta?: { totalPages: number } }>(
          `/operations/work-requests?archived=false&includeTasks=true&limit=100&page=${page}`
        );
        workRequests.push(...(response.data || []));
        totalPages = response.meta?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);

      const optionsList: AssignableTaskOption[] = [];

      for (const wr of workRequests) {
        const tasks: Task[] = wr.tasks || [];
        for (const task of tasks) {
          const isAssigned = effectiveAllTasksForAdmin || isTaskAssignee(user, task);

          if (isAssigned) {
            optionsList.push({
              taskId: task.id,
              taskTitle: task.title,
              workRequestId: wr.id,
              workRequestTitle: wr.title,
              entity: (wr as { entity_code?: string }).entity_code || wr.entity || 'ATA',
              status: task.status,
              phase: task.phase || null,
              clientName: wr.clientName || wr.client_name || (wr.client && wr.client.name) || null,
            });
          }
        }
      }

      return optionsList;
    },
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  });

  const taskOptions = useMemo(() => query.data || [], [query.data]);

  return {
    ...query,
    tasks: taskOptions,
  };
}
