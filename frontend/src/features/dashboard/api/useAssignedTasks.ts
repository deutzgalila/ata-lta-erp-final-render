/**
 * Hook to discover and retrieve assigned tasks for the Log-Time Task Picker
 *
 * Scoping Rule (Spec §4.2):
 * - Scoped to tasks assigned to the current user (via `assigneeId` or `assignees` array)
 * - If user holds `timelog:edit_all` (Admin), they can view/select across all active tasks
 * - Sources tasks from active Work Requests (`/v1/operations/work-requests?archived=false`)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { dashboardKeys } from './queryKeys';
import type { AssignableTaskOption } from './types';
import type { WorkRequest, Task } from '@/features/operations/api/types';

function matchesUserId(entry: unknown, targetUserId?: string): boolean {
  if (!targetUserId || !entry) return false;
  if (typeof entry === 'string') return entry === targetUserId;
  if (typeof entry === 'object' && entry !== null) {
    const obj = entry as { userId?: unknown; user_id?: unknown; id?: unknown };
    return (
      obj.userId === targetUserId ||
      obj.user_id === targetUserId ||
      obj.id === targetUserId
    );
  }
  return false;
}

export interface UseAssignedTasksOptions {
  allTasksForAdmin?: boolean;
}

export function useAssignedTasks(options: UseAssignedTasksOptions = {}) {
  const { allTasksForAdmin = false } = options;
  const user = useSessionStore((state) => state.user);
  const permissions = useSessionStore((state) => state.permissions);
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const canEditAll = hasPermission(permissions, 'timelog:edit_all');
  const userId = user?.id;

  const effectiveAllTasksForAdmin = Boolean(allTasksForAdmin && canEditAll);
  const queryKey = effectiveAllTasksForAdmin
    ? [...dashboardKeys.assignedTasks.scoped(userId), activeEntity, { allTasksForAdmin: true }]
    : [...dashboardKeys.assignedTasks.scoped(userId), activeEntity];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<AssignableTaskOption[]> => {
      // Query active work requests with their tasks
      const response = await apiRequest<{ data: WorkRequest[] }>(
        '/operations/work-requests?archived=false&limit=100&includeTasks=true'
      );
      const workRequests = response.data || [];

      const optionsList: AssignableTaskOption[] = [];

      for (const wr of workRequests) {
        const tasks: Task[] = wr.tasks || [];
        for (const task of tasks) {
          // Check task assignment:
          // 1. If admin with timelog:edit_all AND allTasksForAdmin is enabled, allow any active task
          // 2. Otherwise verify assignment defensively against assigneeId, assignee_id, coAssignees,
          //    co_assignees, taskAssignees, task_assignees, relational_assignees, and assignees
          const isDirectAssignee = Boolean(
            userId && (
              task.assigneeId === userId ||
              (task as { assignee_id?: string }).assignee_id === userId
            )
          );

          const coAssigneeLists = [
            task.assignees,
            (task as { coAssignees?: unknown }).coAssignees,
            (task as { co_assignees?: unknown }).co_assignees,
          ];
          const isCoAssignee = Boolean(
            userId &&
              coAssigneeLists.some(
                (list) => Array.isArray(list) && list.some((item) => matchesUserId(item, userId))
              )
          );

          const taskAssigneeLists = [
            task.taskAssignees,
            (task as { task_assignees?: unknown }).task_assignees,
            (task as { relational_assignees?: unknown }).relational_assignees,
            (task as { relationalAssignees?: unknown }).relationalAssignees,
          ];
          const isTaskAssigneeJoined = Boolean(
            userId &&
              taskAssigneeLists.some(
                (list) => Array.isArray(list) && list.some((item) => matchesUserId(item, userId))
              )
          );

          const isAssigned =
            (allTasksForAdmin && canEditAll) ||
            isDirectAssignee ||
            isCoAssignee ||
            isTaskAssigneeJoined;

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
    staleTime: 60 * 1000,
  });

  const taskOptions = useMemo(() => query.data || [], [query.data]);

  return {
    ...query,
    tasks: taskOptions,
  };
}
