/**
 * Centralized Query Keys for Dashboard Widgets Module
 */

import type { TimeEntryListFilters } from './types';

export const dashboardKeys = {
  timeEntries: {
    all: ['time-entries'] as const,
    summaries: () => [...dashboardKeys.timeEntries.all, 'summary'] as const,
    summary: (date: string, userId?: string) =>
      [...dashboardKeys.timeEntries.summaries(), { date, userId }] as const,
    lists: () => [...dashboardKeys.timeEntries.all, 'list'] as const,
    list: (filters?: TimeEntryListFilters) =>
      [...dashboardKeys.timeEntries.lists(), filters || {}] as const,
    detail: (id: string) => [...dashboardKeys.timeEntries.all, 'detail', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    lists: () => [...dashboardKeys.notifications.all, 'list'] as const,
    list: (params?: { limit?: number; cursor?: string }) =>
      [...dashboardKeys.notifications.lists(), params || {}] as const,
    unreadCount: () => [...dashboardKeys.notifications.all, 'unread-count'] as const,
  },
  assignedTasks: {
    all: ['assigned-tasks'] as const,
    scoped: (userId?: string) => [...dashboardKeys.assignedTasks.all, userId || 'self'] as const,
  },
} as const;
