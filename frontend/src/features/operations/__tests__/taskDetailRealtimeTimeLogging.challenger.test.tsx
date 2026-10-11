/**
 * Challenger Test Suite: TaskDetailModal Real-Time Collaborative Time Logging Synchronization
 *
 * Specification: SPEC-REALTIME-TIME-LOGGING-001
 * Verification Scope:
 * 1. Initial Render: Renders TaskDetailModal with existing time entries and formatted total duration.
 * 2. Live Entry Reflection (time_entries): When an incoming CDC INSERT on time_entries from another employee
 *    arrives, time entries update live, appear in the list, and total duration recalculates without page reload.
 * 3. Legacy CDC Reflection (task_time_logs): When an incoming CDC INSERT on legacy task_time_logs arrives,
 *    hours are normalized to durationMinutes and reflected in the total duration.
 * 4. Live Eviction on Delete: When an incoming CDC DELETE on time_entries arrives, the entry is evicted
 *    from the list and total duration decreases live.
 * 5. Multiplexed Channel Deduplication: Mounting TaskDetailModal while operations.tsx is active shares
 *    the underlying Supabase WebSocket channels (cdc_time_entries & cdc_task_time_logs) without duplicates
 *    or premature teardowns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { supabase, type MockSupabaseClient, type MockRealtimeChannel } from '@/lib/supabase';
import { useSessionStore } from '@/lib/session';
import { clearChannelRegistryForTesting } from '@/lib/realtime/useEntityRealtimeSync';
import { clearLocalMutationsForTesting } from '@/lib/realtime/loopPrevention';
import * as api from '@/lib/api';
import { TaskDetailModal } from '../components/TaskDetailModal';
import OperationsPage from '@/routes/operations';
import type { Task, WorkRequest } from '../api/types';

describe('SPEC-REALTIME-TIME-LOGGING-001: TaskDetailModal Real-Time Time Logging Challenger Suite', () => {
  let queryClient: QueryClient;

  const sampleAdminUser = {
    id: 'usr-admin-1',
    name: 'Admin Manager',
    email: 'admin@ata-lta.ph',
    role: 'Admin',
    departments: ['operations'],
    entities: ['ATA'],
  };

  const mockTask: Task = {
    id: 'task-realtime-101',
    workRequestId: 'wr-realtime-201',
    title: 'Real-Time Audit Task',
    description: 'Testing live reflection of logged time',
    status: 'In Progress',
    phase: 'processing',
    phaseEnteredAt: '2026-10-01T00:00:00Z',
    qaStatus: 'none',
    assigneeId: 'usr-admin-1',
    assigneeName: 'Admin Manager',
    assignees: ['usr-admin-1'],
    taskAssignees: [
      {
        taskId: 'task-realtime-101',
        userId: 'usr-admin-1',
        userName: 'Admin Manager',
        assignedBy: null,
        assignedAt: null,
      },
    ],
    predecessors: [],
    dueDate: '2026-10-31',
    requiredLinkType: null,
    displayOrder: 1,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const mockWr: WorkRequest = {
    id: 'wr-realtime-201',
    title: 'Corporate Year-End Review',
    description: 'Work request for year-end review',
    entity: 'ATA',
    clientId: 'client-101',
    clientName: 'Acme Philippines Inc.',
    phase: 'processing',
    status: 'In Progress',
    priority: 'High',
    archived: false,
    onHold: false,
    phaseEnteredAt: '2026-10-01T00:00:00Z',
    dueDate: '2026-10-31T00:00:00Z',
    requestedBy: 'usr-client-1',
    assignedTo: 'usr-admin-1',
    assignedToName: 'Admin Manager',
    coAssignees: [],
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    tasks: [mockTask],
  };

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
      },
    });
    localStorage.clear();
    clearLocalMutationsForTesting();
    clearChannelRegistryForTesting();
    await (supabase as unknown as MockSupabaseClient).removeAllChannels();

    useSessionStore.getState().setSession({
      user: sampleAdminUser,
      permissions: [
        'workflow:view',
        'workflow:edit',
        'timelog:create',
        'timelog:view',
        'timelog:edit_all',
        'billing:view',
        'disbursement:view',
      ],
      activeEntity: 'ATA',
      unreadCount: 0,
    });
  });

  afterEach(async () => {
    cleanup();
    queryClient.cancelQueries();
    queryClient.clear();
    localStorage.clear();
    clearLocalMutationsForTesting();
    clearChannelRegistryForTesting();
    await (supabase as unknown as MockSupabaseClient).removeAllChannels();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Test 1: Initial Render
  // ==========================================================================
  it('1. Initial Render: displays existing task time entries and formatted total duration', async () => {
    const initialEntries = [
      {
        id: 'entry-init-1',
        user_id: 'usr-worker-1',
        task_id: 'task-realtime-101',
        entry_date: '2026-10-10',
        duration_minutes: 90,
        note: 'Audit balance sheet reconciliations',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      },
    ];

    vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
      if (path.includes('/time-entries')) {
        return { data: initialEntries } as never;
      }
      return { data: [] } as never;
    });

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper: createWrapper() }
    );

    // Verify initial time entry appears in the list
    await waitFor(() => {
      expect(screen.getByTestId('time-entry-item-entry-init-1')).toBeInTheDocument();
      expect(screen.getByText('Audit balance sheet reconciliations')).toBeInTheDocument();
    });

    // 90 minutes formatted is "1h 30m"
    expect(screen.getByText(/Time Logged \(1h 30m\)/)).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();
  });

  // ==========================================================================
  // Test 2: Live Entry Reflection (time_entries INSERT)
  // ==========================================================================
  it('2. Live Entry Reflection: updates time entry list and recalculates total duration upon incoming CDC INSERT on time_entries', async () => {
    let entries = [
      {
        id: 'entry-init-1',
        user_id: 'usr-worker-1',
        task_id: 'task-realtime-101',
        entry_date: '2026-10-10',
        duration_minutes: 90, // 1h 30m
        note: 'Initial audit paperwork',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      },
    ];

    vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
      if (path.includes('/time-entries')) {
        return { data: entries } as never;
      }
      return { data: [] } as never;
    });

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('time-entry-item-entry-init-1')).toBeInTheDocument();
      expect(screen.getByText(/Time Logged \(1h 30m\)/)).toBeInTheDocument();
    });

    const mockClient = supabase as unknown as MockSupabaseClient;
    const timeEntriesChannel = mockClient.getChannel('cdc_time_entries') as MockRealtimeChannel;
    expect(timeEntriesChannel).toBeDefined();

    // Coworker logs 60 minutes
    const newEntry = {
      id: 'entry-live-2',
      user_id: 'usr-coworker-2',
      task_id: 'task-realtime-101',
      entry_date: '2026-10-11',
      duration_minutes: 60,
      note: 'Coworker live logged hours',
      created_at: '2026-10-11T12:00:00Z',
      updated_at: '2026-10-11T12:00:00Z',
    };

    entries = [newEntry, ...entries];

    // Broadcast CDC event from PostgreSQL
    act(() => {
      timeEntriesChannel.emit('postgres_changes', {
        eventType: 'INSERT',
        new: newEntry,
        old: null,
      });
    });

    // Verify live reflection: entry appears and total duration updates from 1h 30m to 2h 30m (90 + 60 = 150m)
    await waitFor(() => {
      expect(screen.getByTestId('time-entry-item-entry-live-2')).toBeInTheDocument();
      expect(screen.getByText('Coworker live logged hours')).toBeInTheDocument();
      expect(screen.getByText(/Time Logged \(2h 30m\)/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Test 3: Legacy CDC Reflection (task_time_logs INSERT)
  // ==========================================================================
  it('3. Legacy CDC Reflection: normalizes legacy task_time_logs hours to durationMinutes and reflects live', async () => {
    let entries = [
      {
        id: 'entry-init-1',
        user_id: 'usr-worker-1',
        task_id: 'task-realtime-101',
        entry_date: '2026-10-10',
        duration_minutes: 60, // 1h
        note: 'First hour logged',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      },
    ];

    vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
      if (path.includes('/time-entries')) {
        return { data: entries } as never;
      }
      return { data: [] } as never;
    });

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('time-entry-item-entry-init-1')).toBeInTheDocument();
      expect(screen.getByText(/Time Logged \(1h\)/)).toBeInTheDocument();
    });

    const mockClient = supabase as unknown as MockSupabaseClient;
    const taskTimeLogsChannel = mockClient.getChannel('cdc_task_time_logs') as MockRealtimeChannel;
    expect(taskTimeLogsChannel).toBeDefined();

    // Legacy employee logs 1.5 hours (90 minutes) on task_time_logs
    const legacyLog = {
      id: 'ttl-legacy-3',
      user_id: 'usr-legacy-worker',
      task_id: 'task-realtime-101',
      date: '2026-10-11',
      hours: 1.5,
      note: 'Field audit operations log',
    };

    // When refetched, backend returns normalized entry
    entries = [
      {
        id: 'ttl-legacy-3',
        user_id: 'usr-legacy-worker',
        task_id: 'task-realtime-101',
        entry_date: '2026-10-11',
        duration_minutes: 90,
        note: 'Field audit operations log',
        created_at: '2026-10-11T14:00:00Z',
        updated_at: '2026-10-11T14:00:00Z',
      },
      ...entries,
    ];

    // Broadcast legacy CDC event
    act(() => {
      taskTimeLogsChannel.emit('postgres_changes', {
        eventType: 'INSERT',
        new: legacyLog,
        old: null,
      });
    });

    // Total duration updates from 1h (60m) to 2h 30m (60 + 90 = 150m)
    await waitFor(() => {
      expect(screen.getByTestId('time-entry-item-ttl-legacy-3')).toBeInTheDocument();
      expect(screen.getByText('Field audit operations log')).toBeInTheDocument();
      expect(screen.getByText(/Time Logged \(2h 30m\)/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Test 4: Live Eviction on Delete
  // ==========================================================================
  it('4. Live Eviction on Delete: evicts deleted time entry and recalculates total duration downwards', async () => {
    let entries = [
      {
        id: 'entry-to-keep',
        user_id: 'usr-worker-1',
        task_id: 'task-realtime-101',
        entry_date: '2026-10-10',
        duration_minutes: 60, // 1h
        note: 'Valid review hours',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'entry-to-delete',
        user_id: 'usr-worker-1',
        task_id: 'task-realtime-101',
        entry_date: '2026-10-10',
        duration_minutes: 120, // 2h
        note: 'Accidental duplicate entry',
        created_at: '2026-10-10T11:00:00Z',
        updated_at: '2026-10-10T11:00:00Z',
      },
    ];

    vi.spyOn(api, 'apiRequest').mockImplementation(async (path: string) => {
      if (path.includes('/time-entries')) {
        return { data: entries } as never;
      }
      return { data: [] } as never;
    });

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper: createWrapper() }
    );

    // Initial total is 1h + 2h = 3h (180m)
    await waitFor(() => {
      expect(screen.getByTestId('time-entry-item-entry-to-delete')).toBeInTheDocument();
      expect(screen.getByText(/Time Logged \(3h\)/)).toBeInTheDocument();
    });

    const mockClient = supabase as unknown as MockSupabaseClient;
    const timeEntriesChannel = mockClient.getChannel('cdc_time_entries') as MockRealtimeChannel;

    // Simulate entry deletion on server
    entries = entries.filter((e) => e.id !== 'entry-to-delete');

    // Broadcast CDC DELETE event
    act(() => {
      timeEntriesChannel.emit('postgres_changes', {
        eventType: 'DELETE',
        new: null,
        old: {
          id: 'entry-to-delete',
          task_id: 'task-realtime-101',
          user_id: 'usr-worker-1',
          duration_minutes: 120,
        },
      });
    });

    // Entry must disappear and total duration reduce to 1h
    await waitFor(() => {
      expect(screen.queryByTestId('time-entry-item-entry-to-delete')).not.toBeInTheDocument();
      expect(screen.getByTestId('time-entry-item-entry-to-keep')).toBeInTheDocument();
      expect(screen.getByText(/Time Logged \(1h\)/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Test 5: Multiplexed Channel Deduplication
  // ==========================================================================
  it('5. Channel Deduplication: sharing channels across OperationsPage and TaskDetailModal without duplication or premature teardown', async () => {
    vi.spyOn(api, 'apiRequest').mockImplementation(async () => {
      return { data: [] } as never;
    });

    const mockClient = supabase as unknown as MockSupabaseClient;

    // Step A: Mount OperationsPage
    const operationsWrapper = render(<OperationsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockClient.getChannel('cdc_time_entries')).toBeDefined();
      expect(mockClient.getChannel('cdc_task_time_logs')).toBeDefined();
    });

    const initialTimeEntriesChannels = mockClient
      .getChannels()
      .filter((c) => c.topic.includes('cdc_time_entries'));
    expect(initialTimeEntriesChannels.length).toBe(1);

    // Step B: Concurrently mount TaskDetailModal
    const modalWrapper = render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper: createWrapper() }
    );

    // Channels must be deduplicated — exactly 1 underlying channel for each table
    const deduplicatedTimeChannels = mockClient
      .getChannels()
      .filter((c) => c.topic.includes('cdc_time_entries'));
    expect(deduplicatedTimeChannels.length).toBe(1);

    const deduplicatedLogChannels = mockClient
      .getChannels()
      .filter((c) => c.topic.includes('cdc_task_time_logs'));
    expect(deduplicatedLogChannels.length).toBe(1);

    // Step C: Unmount TaskDetailModal
    modalWrapper.unmount();

    // The channel must NOT be torn down because OperationsPage is still listening
    const channelAfterModalUnmount = mockClient.getChannel('cdc_time_entries');
    expect(channelAfterModalUnmount).toBeDefined();
    expect(channelAfterModalUnmount?.status).toBe('SUBSCRIBED');

    // Step D: Unmount OperationsPage
    operationsWrapper.unmount();
  });
});
