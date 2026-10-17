import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import { LogTimeWidget } from '../components/LogTimeWidget';
import { useSessionStore } from '@/lib/session';
import { createTimeEntrySchema, updateTimeEntrySchema } from '../api/schemas';
import * as api from '@/lib/api';

describe('Dashboard Adversarial & Boundary Validation Suite', () => {
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
        title: 'Audit Advisory 2026',
        entity_code: 'ATA',
        tasks: [
          {
            id: 'task-1',
            title: 'Task Alpha',
            work_request_id: 'wr-1',
            assignee_id: 'user-worker',
            assignees: ['user-worker'],
            status: 'In Progress',
          },
        ],
      },
    ],
  };

  const sampleEntriesWithCoworker = {
    data: [
      {
        id: 'entry-own',
        user_id: 'user-worker',
        task_id: 'task-1',
        entry_date: new Date().toISOString().slice(0, 10),
        duration_minutes: 30,
        note: 'Own work',
        created_at: '2026-10-04T08:00:00Z',
        updated_at: '2026-10-04T08:00:00Z',
      },
      {
        id: 'entry-coworker',
        user_id: 'user-coworker',
        task_id: 'task-1',
        entry_date: new Date().toISOString().slice(0, 10),
        duration_minutes: 60,
        note: 'Coworker work',
        created_at: '2026-10-04T09:00:00Z',
        updated_at: '2026-10-04T09:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Zod Schema Boundary Validations', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const validUuid = '11111111-1111-4111-8111-111111111111';

    it('accepts duration boundaries: 1 min (min) and 1440 min (max)', () => {
      const minEntry = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: 1,
      });
      expect(minEntry.success).toBe(true);

      const maxEntry = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: 1440,
      });
      expect(maxEntry.success).toBe(true);
    });

    it('rejects invalid durations: 0 min, negative, and 1441 min (>24h)', () => {
      const zeroEntry = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: 0,
      });
      expect(zeroEntry.success).toBe(false);

      const negEntry = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: -15,
      });
      expect(negEntry.success).toBe(false);

      const overMaxEntry = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: 1441,
      });
      expect(overMaxEntry.success).toBe(false);
    });

    it('rejects future entry_date', () => {
      const futureDate = '2099-01-01';
      const futureEntry = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: futureDate,
        duration_minutes: 30,
      });
      expect(futureEntry.success).toBe(false);
    });

    it('validates note length: 5000 allowed, 5001 rejected', () => {
      const allowedNote = 'a'.repeat(5000);
      const resAllowed = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: 30,
        note: allowedNote,
      });
      expect(resAllowed.success).toBe(true);

      const rejectedNote = 'a'.repeat(5001);
      const resRejected = createTimeEntrySchema.safeParse({
        task_id: validUuid,
        entry_date: todayStr,
        duration_minutes: 30,
        note: rejectedNote,
      });
      expect(resRejected.success).toBe(false);
    });

    it('update schema allows partial updates while preserving bounds', () => {
      const validPartial = updateTimeEntrySchema.safeParse({
        duration_minutes: 45,
      });
      expect(validPartial.success).toBe(true);

      const invalidDurationPartial = updateTimeEntrySchema.safeParse({
        duration_minutes: 0,
      });
      expect(invalidDurationPartial.success).toBe(false);
    });
  });

  describe('Isolation & RBAC Boundaries', () => {
    it('restricts edit/delete buttons on coworker entries for non-admin staff', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-worker',
          email: 'worker@ata-lta.ph',
          name: 'Worker User',
          role: 'Staff',
          departments: [],
          entities: ['ATA'],
        },
        permissions: ['timelog:create', 'timelog:view', 'timelog:edit_own'],
      });

      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) {
          return { data: { date: '2026-10-04', total_minutes: 90, by_task: [] } } as never;
        }
        if (path.includes('/time-entries')) return sampleEntriesWithCoworker as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      // Own entry has edit & delete buttons
      expect(await screen.findByTestId('edit-entry-btn-entry-own')).toBeInTheDocument();
      expect(await screen.findByTestId('delete-entry-btn-entry-own')).toBeInTheDocument();

      // Coworker entry should NOT have edit & delete buttons
      expect(screen.queryByTestId('edit-entry-btn-entry-coworker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-entry-btn-entry-coworker')).not.toBeInTheDocument();
    });

    it('renders edit/delete buttons on ALL entries for Admin holding timelog:edit_all', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-admin',
          email: 'admin@ata-lta.ph',
          name: 'Admin User',
          role: 'Admin',
          departments: [],
          entities: ['ATA'],
        },
        permissions: ['timelog:create', 'timelog:view', 'timelog:edit_all'],
      });

      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) {
          return { data: { date: '2026-10-04', total_minutes: 90, by_task: [] } } as never;
        }
        if (path.includes('/time-entries')) return sampleEntriesWithCoworker as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      // Admin can edit & delete both entries
      expect(await screen.findByTestId('edit-entry-btn-entry-own')).toBeInTheDocument();
      expect(await screen.findByTestId('delete-entry-btn-entry-own')).toBeInTheDocument();
      expect(await screen.findByTestId('edit-entry-btn-entry-coworker')).toBeInTheDocument();
      expect(await screen.findByTestId('delete-entry-btn-entry-coworker')).toBeInTheDocument();
    });

    it('disables form inputs and submission when user lacks timelog:create', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-guest',
          email: 'guest@ata-lta.ph',
          name: 'Guest User',
          role: 'Viewer',
          departments: [],
          entities: ['ATA'],
        },
        permissions: ['timelog:view'], // lacks timelog:create
      });

      vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
        if (path.includes('/operations/work-requests')) return sampleTasksResponse as never;
        if (path.includes('/time-entries/summary')) {
          return { data: { date: '2026-10-04', total_minutes: 0, by_task: [] } } as never;
        }
        if (path.includes('/time-entries')) return { data: [] } as never;
        return { data: [] } as never;
      });

      render(<LogTimeWidget />, { wrapper: createWrapper() });

      const durationInput = await screen.findByTestId('duration-minutes-input');
      const submitBtn = screen.getByTestId('submit-timelog-btn');

      expect(durationInput).toBeDisabled();
      expect(submitBtn).toBeDisabled();
    });
  });
});
