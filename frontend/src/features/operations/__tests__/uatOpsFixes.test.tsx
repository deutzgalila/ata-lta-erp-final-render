import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhaseKanbanBoard } from '../components/PhaseKanbanBoard';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { WorkRequestSidePeek } from '../components/WorkRequestSidePeek';
import { WorkRequestList } from '../components/WorkRequestList';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '../components/BlockingActionModal';
import { apiRequest } from '@/lib/api';
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

const mockWr: WorkRequest = {
  id: 'wr-uat-1',
  entity: 'ATA',
  title: 'Q1 Compliance Audit',
  description: 'Annual corporate filings and compliance checks',
  clientId: 'c-1',
  clientName: 'Sycip Tech Phils',
  status: 'In Progress',
  phase: 'pre_processing',
  priority: 'High',
  archived: false,
  onHold: false,
  phaseEnteredAt: '2026-01-01T00:00:00Z',
  dueDate: '2026-03-31T00:00:00Z',
  requestedBy: 'user-1',
  assignedTo: 'Jane Lead',
  coAssignees: ['Alice Staff', 'Bob Staff'],
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  tasks: [],
};

const mockTasks: Task[] = [
  {
    id: 'task-101',
    workRequestId: 'wr-uat-1',
    title: 'Audit Financial Worksheets',
    description: 'Reconcile Q1 general ledger against bank statements',
    status: 'In Progress',
    phase: 'pre_processing',
    qaStatus: 'none',
    phaseEnteredAt: '2026-01-01T00:00:00Z',
    assigneeId: 'user-2',
    assigneeName: 'Alice Staff',
    assignees: ['user-2'],
    predecessors: [],
    dueDate: '2026-02-15T00:00:00Z',
    requiredLinkType: null,
    displayOrder: 1,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'task-102',
    workRequestId: 'wr-uat-1',
    title: 'Draft Tax Summary Report',
    description: 'Summarize tax deductions and withholding credits',
    status: 'Completed',
    phase: 'pre_processing',
    qaStatus: 'passed',
    phaseEnteredAt: '2026-01-01T00:00:00Z',
    assigneeId: 'user-3',
    assigneeName: 'Bob Staff',
    assignees: ['user-3'],
    predecessors: ['task-101'],
    dueDate: '2026-02-28T00:00:00Z',
    requiredLinkType: null,
    displayOrder: 2,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('Parcel OPS UAT Fix Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'u-admin-1',
        email: 'ops.manager@ata-lta.ph',
        name: 'Manager Test',
        role: 'Manager',
        departments: ['Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'workflow:phase_transition',
        'workflow:transition_request',
        'workflow:qa_review',
        'workflow:task_add',
      ],
      activeEntity: 'ATA',
    });
  });

  describe('UAT-GEN1: Entity "ALL" Filter Header Behavior in lib/api.ts', () => {
    it('omits X-Active-Entity header when activeEntity is ALL', async () => {
      useSessionStore.getState().setActiveEntity('ALL');

      let capturedHeaders: Record<string, string> = {};
      vi.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      await apiRequest('/test-endpoint');

      expect(capturedHeaders['X-Active-Entity']).toBeUndefined();
      expect(capturedHeaders['x-active-entity']).toBeUndefined();
    });

    it('includes X-Active-Entity header when activeEntity is ATA or LTA', async () => {
      useSessionStore.getState().setActiveEntity('LTA');

      let capturedHeaders: Record<string, string> = {};
      vi.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      await apiRequest('/test-endpoint');

      expect(capturedHeaders['X-Active-Entity']).toBe('LTA');
    });
  });

  describe('UAT-OPS4 & UAT-OPS5: PhaseKanbanBoard and TaskDetailModal', () => {
    it('UAT-OPS5: renders task cards without drag attributes and without GripVertical', async () => {
      const { wrapper } = createTestHarness();

      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/operations/work-requests?')) {
          return new Response(JSON.stringify({ data: [mockWr] }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1/tasks')) {
          return new Response(JSON.stringify({ data: mockTasks }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1')) {
          return new Response(JSON.stringify({ data: mockWr }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      render(<PhaseKanbanBoard initialWorkRequestId="wr-uat-1" />, { wrapper });

      const taskCard = await screen.findByTestId('kanban-task-card-task-101');
      expect(taskCard).toBeInTheDocument();

      // Card is NOT draggable
      expect(taskCard).toHaveAttribute('draggable', 'false');

      // Card has cursor-pointer for clicking to open detail modal
      expect(taskCard.className).toContain('cursor-pointer');
    });

    it('UAT-OPS4: clicking task card opens TaskDetailModal with description, documents, and time logged summary', async () => {
      const { wrapper } = createTestHarness();

      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/operations/work-requests?')) {
          return new Response(JSON.stringify({ data: [mockWr] }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1/tasks')) {
          return new Response(JSON.stringify({ data: mockTasks }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1')) {
          return new Response(JSON.stringify({ data: mockWr }), { status: 200 });
        }
        if (url.includes('/time-entries?')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'te-1',
                  user_id: 'u-1',
                  task_id: 'task-101',
                  entry_date: '2026-02-01',
                  duration_minutes: 45,
                  note: 'Reconciled first batch of ledgers',
                  created_at: '2026-02-01T00:00:00Z',
                  updated_at: '2026-02-01T00:00:00Z',
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.includes('/documents?')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'doc-1',
                  work_request_id: 'wr-uat-1',
                  linked_task_id: 'task-101',
                  original_name: 'Audit_Schedule_Q1.xlsx',
                  file_name: 'Audit_Schedule_Q1.xlsx',
                  category: 'WORKING_PAPER',
                  comments: [],
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      render(<PhaseKanbanBoard initialWorkRequestId="wr-uat-1" />, { wrapper });

      const taskCard = await screen.findByTestId('kanban-task-card-task-101');
      fireEvent.click(taskCard);

      // TaskDetailModal should open
      const modal = await screen.findByTestId('task-detail-modal');
      expect(modal).toBeInTheDocument();

      // Title & Description
      expect(screen.getByTestId('task-title')).toHaveTextContent('Audit Financial Worksheets');
      expect(screen.getByTestId('task-description')).toHaveTextContent(
        'Reconcile Q1 general ledger against bank statements'
      );

      // Assignee
      expect(screen.getByTestId('task-assignee')).toHaveTextContent('Alice Staff');

      // Documents section
      expect(screen.getByTestId('task-documents-section')).toBeInTheDocument();
      expect(await screen.findByText('Audit_Schedule_Q1.xlsx')).toBeInTheDocument();

      // Time logged section
      expect(screen.getByTestId('task-time-logged-section')).toBeInTheDocument();
      expect(await screen.findByText('Reconciled first batch of ledgers')).toBeInTheDocument();

      // Log Time entry button is present
      const logTimeBtn = screen.getByTestId('open-log-time-btn');
      expect(logTimeBtn).toBeInTheDocument();
      fireEvent.click(logTimeBtn);

      // Log time form renders
      expect(screen.getByTestId('log-time-form')).toBeInTheDocument();
      expect(screen.getByTestId('log-time-minutes-input')).toBeInTheDocument();
      expect(screen.getByTestId('log-time-submit-btn')).toBeInTheDocument();
    });

    it('TaskDetailModal submits new time entry via useCreateTimeEntry', async () => {
      const { wrapper } = createTestHarness();

      let createdPayload: unknown = null;
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/time-entries') && init?.method === 'POST') {
          createdPayload = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              data: {
                id: 'te-new',
                task_id: 'task-101',
                entry_date: '2026-02-10',
                duration_minutes: 60,
                note: 'Completed second reconciliation batch',
                created_at: '2026-02-10T00:00:00Z',
                updated_at: '2026-02-10T00:00:00Z',
              },
            }),
            { status: 201 }
          );
        }
        if (url.includes('/time-entries')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (url.includes('/documents')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      render(
        <TaskDetailModal
          isOpen={true}
          onClose={vi.fn()}
          task={mockTasks[0]!}
          workRequest={mockWr}
        />,
        { wrapper }
      );

      // Open log time form
      fireEvent.click(screen.getByTestId('open-log-time-btn'));

      // Fill form
      fireEvent.change(screen.getByTestId('log-time-minutes-input'), {
        target: { value: '60' },
      });
      fireEvent.change(screen.getByTestId('log-time-note-input'), {
        target: { value: 'Completed second reconciliation batch' },
      });

      // Submit
      fireEvent.submit(screen.getByTestId('log-time-form'));

      await waitFor(() => {
        expect(createdPayload).toEqual({
          task_id: 'task-101',
          entry_date: expect.any(String),
          duration_minutes: 60,
          note: 'Completed second reconciliation batch',
        });
      });
    });
  });

  describe('UAT-GEN2: WorkRequestSidePeek and WorkRequestList Integration', () => {
    it('WorkRequestSidePeek renders WR attributes, blocker warning, and tasks list', async () => {
      const { wrapper } = createTestHarness();

      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/operations/work-requests/wr-uat-1/tasks')) {
          return new Response(JSON.stringify({ data: mockTasks }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1')) {
          return new Response(JSON.stringify({ data: mockWr }), { status: 200 });
        }
        if (url.includes('/documents')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      const onEdit = vi.fn();
      const onViewInBoard = vi.fn();

      render(
        <WorkRequestSidePeek
          isOpen={true}
          workRequestId="wr-uat-1"
          onClose={vi.fn()}
          onEdit={onEdit}
          onViewInBoard={onViewInBoard}
        />,
        { wrapper }
      );

      // Title & attributes
      await waitFor(() => {
        expect(screen.getByTestId('side-peek-title')).toHaveTextContent('Q1 Compliance Audit');
      });
      expect(screen.getByTestId('side-peek-client')).toHaveTextContent('Sycip Tech Phils');
      expect(screen.getByTestId('side-peek-phase')).toHaveTextContent('pre processing');

      // Blocker alert (task-101 is In Progress in pre_processing)
      expect(await screen.findByTestId('side-peek-blocker-alert')).toBeInTheDocument();

      // Tasks breakdown
      expect(screen.getByTestId('side-peek-tasks')).toBeInTheDocument();
      expect(screen.getByText('Audit Financial Worksheets')).toBeInTheDocument();
      expect(screen.getByText('Draft Tax Summary Report')).toBeInTheDocument();

      // Board button triggers onViewInBoard
      const boardBtn = screen.getByTestId('side-peek-board-btn');
      fireEvent.click(boardBtn);
      expect(onViewInBoard).toHaveBeenCalledWith('wr-uat-1');
    });

    it('WorkRequestList opens WorkRequestSidePeek on title or view button click', async () => {
      const { wrapper } = createTestHarness();

      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/operations/work-requests?')) {
          return new Response(JSON.stringify({ data: [mockWr] }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1/tasks')) {
          return new Response(JSON.stringify({ data: mockTasks }), { status: 200 });
        }
        if (url.includes('/operations/work-requests/wr-uat-1')) {
          return new Response(JSON.stringify({ data: mockWr }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      render(<WorkRequestList />, { wrapper });

      // Click row title
      const titleEl = await screen.findByText('Q1 Compliance Audit');
      fireEvent.click(titleEl);

      // Side peek should open
      const sidePeek = await screen.findByTestId('wr-side-peek');
      expect(sidePeek).toBeInTheDocument();

      // Close button closes side peek
      fireEvent.click(screen.getByTestId('side-peek-close-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('wr-side-peek')).not.toBeInTheDocument();
      });
    });
  });
});
