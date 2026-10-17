import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import { LogTimeWidget } from '../components/LogTimeWidget';
import { PendingTasksCard } from '../components/PendingTasksCard';
import DashboardPage from '@/routes/dashboard';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';

describe('Dashboard Widgets (LogTimeWidget & DashboardPage)', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(BrowserRouter, null, children)
      );
  };

  const sampleTasksResponse = {
    data: [
      {
        id: 'wr-1',
        title: 'Tax Compliance 2026',
        entity_code: 'ATA',
        client_name: 'Acme Corp',
        tasks: [
          {
            id: 'task-assigned-1',
            title: 'Gather BIR Form 2307',
            work_request_id: 'wr-1',
            assignee_id: 'user-worker',
            assignees: ['user-worker'],
            status: 'In Progress',
            phase: 'processing',
          },
          {
            id: 'task-unassigned-2',
            title: 'Financial Statements Audit',
            work_request_id: 'wr-1',
            assignee_id: 'user-other',
            assignees: ['user-other'],
            status: 'In Progress',
            phase: 'processing',
          },
        ],
      },
    ],
  };

  const sampleSummaryResponse = {
    data: {
      date: new Date().toISOString().slice(0, 10),
      total_minutes: 90,
      by_task: [
        {
          task_id: 'task-assigned-1',
          work_request_id: 'wr-1',
          title: 'Gather BIR Form 2307',
          minutes: 90,
        },
      ],
    },
  };

  const sampleEntriesResponse = {
    data: [
      {
        id: 'entry-1',
        user_id: 'user-worker',
        task_id: 'task-assigned-1',
        entry_date: new Date().toISOString().slice(0, 10),
        duration_minutes: 90,
        note: 'Gathered quarterly tax credits',
        created_at: '2026-10-04T08:00:00Z',
        updated_at: '2026-10-04T08:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-worker',
        email: 'dev-docs@ata-lta.ph',
        name: 'Dev Documentation',
        role: 'Manager',
        departments: [],
        entities: ['ATA'],
      },
      permissions: ['timelog:create', 'timelog:view', 'timelog:edit_own', 'notifications:view'],
      unreadCount: 4,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LogTimeWidget Form & Scoped Task Picker', () => {
    it('renders assigned task picker with scoped tasks only', async () => {
      vi.spyOn(api, 'apiRequest')
        .mockImplementation(async (path: string) => {
          if (path.includes('/operations/work-requests')) {
            return sampleTasksResponse as never;
          }
          if (path.includes('/time-entries/summary')) {
            return sampleSummaryResponse as never;
          }
          if (path.includes('/time-entries')) {
            return sampleEntriesResponse as never;
          }
          return { data: [] } as never;
        });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      const select = await screen.findByTestId('task-picker-select');
      expect(select).toBeInTheDocument();

      // Assigned tasks must be in the options
      expect(screen.getAllByText(/Gather BIR Form 2307/).length).toBeGreaterThan(0);
      // Unassigned task should NOT be in the options for non-admin user
      expect(screen.queryByText(/Financial Statements Audit/)).not.toBeInTheDocument();
    });

    it('updates duration input when clicking duration quick-chips', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) return sampleSummaryResponse as never;
        if (path.includes('/time-entries')) return sampleEntriesResponse as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      const durationInput = (await screen.findByTestId('duration-minutes-input')) as HTMLInputElement;
      expect(durationInput.value).toBe('30');

      // Click 15m preset
      fireEvent.click(screen.getByTestId('duration-chip-15'));
      expect(durationInput.value).toBe('15');

      // Click 60m preset
      fireEvent.click(screen.getByTestId('duration-chip-60'));
      expect(durationInput.value).toBe('60');

      // Click 2h preset
      fireEvent.click(screen.getByTestId('duration-chip-120'));
      expect(durationInput.value).toBe('120');
    });

    it('supports timer toggle to start, count elapsed, and stop & fill duration', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) return sampleSummaryResponse as never;
        if (path.includes('/time-entries')) return sampleEntriesResponse as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      // Start timer
      const startBtn = await screen.findByTestId('start-timer-btn');
      fireEvent.click(startBtn);

      // Advance time by 65 seconds
      act(() => {
        vi.advanceTimersByTime(65000);
      });

      // Stop & Fill
      const stopBtn = screen.getByTestId('stop-timer-btn');
      fireEvent.click(stopBtn);

      // 65 seconds rounds up to 2 minutes
      const durationInput = screen.getByTestId('duration-minutes-input') as HTMLInputElement;
      expect(durationInput.value).toBe('2');

      vi.useRealTimers();
    });

    it('submits time entry and surfaces RFC 7807 error verbatim on 403 Forbidden', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string, options?: api.RequestOptions) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) return sampleSummaryResponse as never;
        if (path.includes('/time-entries') && options?.method === 'POST') {
          throw new ApiError(403, 'Forbidden', 'You are not assigned to this task', 'FORBIDDEN');
        }
        if (path.includes('/time-entries')) return sampleEntriesResponse as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      const submitBtn = await screen.findByTestId('submit-timelog-btn');
      await waitFor(() => expect(submitBtn).not.toBeDisabled());
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const errorState = useBlockingModalStore.getState();
        expect(errorState.isOpen).toBe(true);
        expect(errorState.status).toBe('error');
        expect(errorState.error?.code).toBe('FORBIDDEN');
        expect(errorState.error?.detail).toBe('You are not assigned to this task');
      });
    });

    it('renders edit modal on clicking edit entry button', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) return sampleSummaryResponse as never;
        if (path.includes('/time-entries')) return sampleEntriesResponse as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      const editBtn = await screen.findByTestId('edit-entry-btn-entry-1');
      fireEvent.click(editBtn);

      expect(screen.getByTestId('time-entry-edit-modal')).toBeInTheDocument();
      expect(screen.getByTestId('edit-duration-input')).toHaveValue(90);
    });

    it('renders delete modal on clicking delete entry button', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) return sampleSummaryResponse as never;
        if (path.includes('/time-entries')) return sampleEntriesResponse as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      const deleteBtn = await screen.findByTestId('delete-entry-btn-entry-1');
      fireEvent.click(deleteBtn);

      expect(screen.getByTestId('time-entry-delete-modal')).toBeInTheDocument();
      expect(screen.getByTestId('delete-confirm-btn')).toBeInTheDocument();
    });
  });

  describe('DashboardPage Route Integration', () => {
    it('renders dashboard stat cards, role, entity, unread count, and today logged hours', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) return sampleSummaryResponse as never;
        if (path.includes('/time-entries')) return sampleEntriesResponse as never;
        return { data: [] } as never;
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.getByTestId('stat-role')).toHaveTextContent('Manager');
      expect(screen.getByTestId('stat-entity')).toHaveTextContent('ATA');
      expect(screen.getByTestId('stat-unread-count')).toHaveTextContent('4');
      await waitFor(() => {
        expect(screen.getByTestId('stat-today-hours')).toHaveTextContent('1h 30m');
      });
      expect(screen.getByTestId('log-time-widget')).toBeInTheDocument();
      expect(screen.getByTestId('pending-tasks-card')).toBeInTheDocument();
    });
  });

  describe('PendingTasksCard Component (UAT-SH4)', () => {
    beforeEach(() => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-worker',
          email: 'worker@ata-lta.ph',
          name: 'Worker User',
          role: 'Staff',
          departments: ['Operations'],
          entities: ['ATA'],
        },
        permissions: ['timelog:create'],
        activeEntity: 'ATA',
      });
    });

    it('renders assigned incomplete tasks with entity and phase badges, and filters out unassigned tasks', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        return { data: [] } as never;
      });

      render(<PendingTasksCard />, { wrapper: createWrapper() });

      expect(screen.getByTestId('pending-tasks-card')).toBeInTheDocument();
      expect(screen.getByText('Pending Tasks Assigned to Me')).toBeInTheDocument();

      // Assigned task should appear
      const taskItem = await screen.findByTestId('pending-task-task-assigned-1');
      expect(taskItem).toBeInTheDocument();
      expect(screen.getByText('Gather BIR Form 2307')).toBeInTheDocument();
      expect(screen.getByText('Tax Compliance 2026')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByTestId('view-task-btn-task-assigned-1')).toBeInTheDocument();

      // Unassigned task should NOT appear
      expect(screen.queryByTestId('pending-task-task-unassigned-2')).not.toBeInTheDocument();
    });

    it('renders empty state when there are no incomplete tasks', async () => {
      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) {
          return {
            data: [
              {
                id: 'wr-empty',
                title: 'Finished WR',
                tasks: [
                  {
                    id: 'task-completed-1',
                    title: 'Completed Review',
                    assignee_id: 'user-worker',
                    status: 'Completed',
                  },
                ],
              },
            ],
          } as never;
        }
        return { data: [] } as never;
      });

      render(<PendingTasksCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('pending-tasks-empty')).toBeInTheDocument();
      });
      expect(screen.getByText('All caught up!')).toBeInTheDocument();
    });
  });
});

