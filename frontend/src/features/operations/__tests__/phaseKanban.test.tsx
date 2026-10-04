import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhaseKanbanBoard } from '../components/PhaseKanbanBoard';
import { RerouteModal } from '../components/RerouteModal';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '../components/BlockingActionModal';
import type { WorkRequest, Task } from '../api/types';

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

const mockWorkRequests = [
  {
    id: 'wr-101',
    title: 'Annual Tax Filing 2025',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'pre_processing',
    priority: 'High',
    clientId: 'client-1',
    clientName: 'Acme Philippines Corp',
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tasks: [],
  },
] as unknown as WorkRequest[];

const mockPreTasks = [
  {
    id: 'task-1',
    workRequestId: 'wr-101',
    title: 'Gather BIR 2307 Certificates',
    phase: 'pre_processing',
    status: 'In Progress',
    boardOrder: 1000,
    qaStatus: undefined,
    checklist: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'task-2',
    workRequestId: 'wr-101',
    title: 'Verify General Ledger Entries',
    phase: 'pre_processing',
    status: 'Completed',
    boardOrder: 2000,
    qaStatus: undefined,
    checklist: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
] as unknown as Task[];

describe('Phase Kanban Board & Routing Features (Milestone 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'u-admin-1',
        email: 'admin@ata-lta.ph',
        name: 'Admin Test',
        role: 'Admin',
        departments: ['Operations'],
        entities: ['ALL'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'workflow:phase_transition',
        'workflow:transition_request',
        'workflow:qa_review',
        'workflow:task_add',
      ],
      activeEntity: 'ALL',
    });
  });

  it('renders all 4 phase columns and displays gate progress', async () => {
    const { wrapper } = createTestHarness();

    // Mock API responses
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/operations/work-requests?')) {
        return new Response(JSON.stringify({ data: mockWorkRequests }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101/tasks')) {
        return new Response(JSON.stringify({ data: mockPreTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101')) {
        return new Response(JSON.stringify({ data: mockWorkRequests[0] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    render(<PhaseKanbanBoard initialWorkRequestId="wr-101" />, { wrapper });

    // Assert 4 phase columns rendered
    expect(await screen.findByTestId('kanban-phase-column-pre_processing')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-phase-column-processing')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-phase-column-quality_assurance')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-phase-column-completion')).toBeInTheDocument();

    // Assert gate progress in pre-processing column
    const gateProgress = await screen.findByTestId('gate-progress-pre_processing');
    expect(gateProgress).toHaveTextContent('1/2 completed');

    // Assert task cards rendered
    expect(screen.getByText('Gather BIR 2307 Certificates')).toBeInTheDocument();
    expect(screen.getByText('Verify General Ledger Entries')).toBeInTheDocument();
  });

  it('disables phase advance actions with tooltip when gate prerequisites are not met', async () => {
    const { wrapper } = createTestHarness();

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/operations/work-requests?')) {
        return new Response(JSON.stringify({ data: mockWorkRequests }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101/tasks')) {
        return new Response(JSON.stringify({ data: mockPreTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101')) {
        return new Response(JSON.stringify({ data: mockWorkRequests[0] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    render(<PhaseKanbanBoard initialWorkRequestId="wr-101" />, { wrapper });

    // Blocker warning badge is present
    const blockerWarning = await screen.findByTestId('gate-blocker-pre_processing');
    expect(blockerWarning).toHaveTextContent('1 task(s) block advancement');

    // Manager action button is disabled
    const managerBtn = screen.getByTestId('manager-notify-admin-btn');
    expect(managerBtn).toBeDisabled();
    expect(managerBtn).toHaveAttribute('title');
    expect(managerBtn.getAttribute('title')).toContain('Gather BIR 2307 Certificates');

    // Admin advance button is disabled
    const adminBtn = screen.getByTestId('admin-advance-btn');
    expect(adminBtn).toBeDisabled();
  });

  it('strictly blocks cross-phase drag-and-drop in the UI', async () => {
    const { wrapper } = createTestHarness();

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/operations/work-requests?')) {
        return new Response(JSON.stringify({ data: mockWorkRequests }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101/tasks')) {
        return new Response(JSON.stringify({ data: mockPreTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101')) {
        return new Response(JSON.stringify({ data: mockWorkRequests[0] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    render(<PhaseKanbanBoard initialWorkRequestId="wr-101" />, { wrapper });

    const taskCard = await screen.findByTestId('kanban-task-card-task-1');
    const targetProcessingCol = screen.getByTestId('kanban-phase-column-processing');

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(key: string, val: string) {
        this.data[key] = val;
      },
      getData(key: string) {
        return this.data[key] || '';
      },
      dropEffect: 'none',
    };

    // 1. Drag starts on pre_processing task
    fireEvent.dragStart(taskCard, { dataTransfer });

    // 2. Drag over processing column (cross-phase)
    fireEvent.dragOver(targetProcessingCol, { dataTransfer });

    // Cross-phase drops are prohibited in UI
    expect(dataTransfer.dropEffect).toBe('none');

    // 3. Drop on processing column should be rejected
    const fetchCallsBefore = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.drop(targetProcessingCol, { dataTransfer });

    // No mutation should have been fired
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallsBefore);
  });

  it('renders QA review controls and submits pass/fail evaluation', async () => {
    const { wrapper } = createTestHarness();

    const qaWorkRequest = {
      ...mockWorkRequests[0]!,
      phase: 'quality_assurance',
      status: 'In Progress',
    } as unknown as WorkRequest;

    const qaTasks = [
      {
        id: 'task-qa-1',
        workRequestId: 'wr-101',
        title: 'BIR Form 1702Q QA Inspection',
        phase: 'processing',
        status: 'Completed',
        boardOrder: 1000,
        qaStatus: undefined,
        checklist: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ] as unknown as Task[];

    let postBody: unknown = null;
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/operations/work-requests?')) {
        return new Response(JSON.stringify({ data: [qaWorkRequest] }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101/tasks')) {
        return new Response(JSON.stringify({ data: qaTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101/qa-review')) {
        postBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: { ...qaWorkRequest } }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-101')) {
        return new Response(JSON.stringify({ data: qaWorkRequest }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    render(<PhaseKanbanBoard initialWorkRequestId="wr-101" />, { wrapper });

    // QA controls are rendered on the task card
    const passBtn = await screen.findByTestId('qa-pass-btn-task-qa-1');
    expect(passBtn).toBeInTheDocument();

    // Click Pass button
    fireEvent.click(passBtn);

    await waitFor(() => {
      expect(postBody).toEqual({
        results: [
          {
            task_id: 'task-qa-1',
            qa_status: 'passed',
            taskId: 'task-qa-1',
            qaStatus: 'passed',
          },
        ],
      });
    });
  });

  it('RerouteModal requires a non-empty reason and submits reroute payload', async () => {
    let rerouteBody: unknown = null;
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/operations/work-requests/wr-101/reroute')) {
        rerouteBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            data: { id: 'wr-101', phase: 'processing', status: 'In Progress', reopenedTaskIds: ['task-failed-1'] },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const { wrapper } = createTestHarness();

    render(
      <RerouteModal
        isOpen={true}
        onClose={onClose}
        workRequestId="wr-101"
        failedTasks={[{ id: 'task-failed-1', title: 'Withholding Tax Calculation' }]}
        onSuccess={onSuccess}
      />,
      { wrapper }
    );

    // Assert failed task listed in modal
    expect(screen.getByText('Withholding Tax Calculation')).toBeInTheDocument();
    expect(screen.getByTestId('reroute-failed-badge')).toHaveTextContent('1 Failed');

    // 1. Submit empty reason -> blocked
    const confirmBtn = screen.getByTestId('confirm-reroute-btn');
    fireEvent.click(confirmBtn);

    expect(await screen.findByTestId('reroute-reason-error')).toHaveTextContent(
      'A non-empty reroute reason is required'
    );
    expect(rerouteBody).toBeNull();

    // 2. Type reason and submit
    const reasonInput = screen.getByTestId('reroute-reason-input');
    fireEvent.change(reasonInput, {
      target: { value: 'Discrepancy in line 14 deductions requires recalculation' },
    });

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(rerouteBody).toEqual({
        to_phase: 'processing',
        reason: 'Discrepancy in line 14 deductions requires recalculation',
      });
    });
  });
});
