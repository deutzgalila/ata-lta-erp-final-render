/**
 * Kanban Soft-Delete Eviction, Gate Unblocking, & Child Modal Invalidation
 * Empirical Challenger Verification Suite (Milestone 5 Parcel 5)
 *
 * Requirements & Hypotheses:
 * 1. Test 1 (Soft-delete deselect & eviction):
 *    When a task is open in TaskDetailModal, emit a CDC UPDATE with deleted_at = now().
 *    Verify selectedTask is immediately deselected (setSelectedTask(null)), closing the modal,
 *    and the card is evicted from the Kanban board.
 * 2. Test 2 (Gate unblocking on soft-delete):
 *    When an incomplete task in pre_processing or processing is soft-deleted,
 *    verify gateInfo immediately removes it from incomplete tasks and canAdvance transitions to true.
 * 3. Test 3 (Child modal close invalidation):
 *    Verify closing InvoiceCreateModal, CreateDisbursementModal, TransmittalFormModal,
 *    DocumentUploadModal, or DocumentViewerModal triggers:
 *    queryClient.invalidateQueries({ queryKey: operationsKeys.taskRelated(task.id) })
 *
 * Strict Invariants:
 * - ZERO Playwright / browser automation plugins.
 * - ZERO hardcoded secrets.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhaseKanbanBoard } from '../components/PhaseKanbanBoard';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '../components/BlockingActionModal';
import { supabase, MockSupabaseClient } from '@/lib/supabase';
import { useEntityRealtimeSync, clearChannelRegistryForTesting } from '@/lib/realtime/useEntityRealtimeSync';
import { operationsKeys } from '../api/queryKeys';
import type { WorkRequest, Task, DmsDocument } from '../api/types';

// ============================================================================
// Mock Child Modals (Testing Invalidation Triggers on Close/Success)
// ============================================================================

vi.mock('@/features/billing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    InvoiceCreateModal: ({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated?: () => void }) =>
      isOpen ? (
        <div data-testid="mock-invoice-create-modal">
          <button data-testid="close-invoice-modal-btn" onClick={onClose}>
            Close Invoice Modal
          </button>
          <button data-testid="created-invoice-modal-btn" onClick={() => onCreated?.()}>
            Created Invoice Modal
          </button>
        </div>
      ) : null,
  };
});

vi.mock('@/features/disbursements', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CreateDisbursementModal: ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void }) =>
      isOpen ? (
        <div data-testid="mock-disbursement-create-modal">
          <button data-testid="close-disbursement-modal-btn" onClick={onClose}>
            Close Disbursement Modal
          </button>
          <button data-testid="success-disbursement-modal-btn" onClick={() => onSuccess?.()}>
            Success Disbursement Modal
          </button>
        </div>
      ) : null,
  };
});

vi.mock('@/features/transmittals', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    TransmittalFormModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
      isOpen ? (
        <div data-testid="mock-transmittal-form-modal">
          <button data-testid="close-transmittal-modal-btn" onClick={onClose}>
            Close Transmittal Modal
          </button>
        </div>
      ) : null,
  };
});

vi.mock('@/features/documents', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    DocumentUploadModal: ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void }) =>
      isOpen ? (
        <div data-testid="mock-document-upload-modal">
          <button data-testid="close-document-upload-modal-btn" onClick={onClose}>
            Close Document Upload Modal
          </button>
          <button data-testid="success-document-upload-modal-btn" onClick={() => onSuccess?.()}>
            Success Document Upload Modal
          </button>
        </div>
      ) : null,
    DocumentViewerModal: ({ isOpen, onClose, onUploadSuccess }: { isOpen: boolean; onClose: () => void; onUploadSuccess?: (doc: unknown) => void }) =>
      isOpen ? (
        <div data-testid="mock-document-viewer-modal">
          <button data-testid="close-document-viewer-modal-btn" onClick={onClose}>
            Close Document Viewer Modal
          </button>
          <button data-testid="success-document-viewer-modal-btn" onClick={() => onUploadSuccess?.({})}>
            Upload Success Document Viewer Modal
          </button>
        </div>
      ) : null,
  };
});

// ============================================================================
// Realtime Tasks Listener Helper Component
// ============================================================================

function RealtimeTasksSync({ activeEntity = 'ATA' }: { activeEntity?: string }) {
  useEntityRealtimeSync({
    table: 'tasks',
    listRootKey: operationsKeys.workRequests(),
    activeEntity,
    enabled: true,
  });
  return null;
}

// ============================================================================
// Test Suite Setup & Mocks
// ============================================================================

describe('Kanban Soft-Delete Eviction, Gate Unblocking, & Modal Invalidation (Challenger Suite)', () => {
  let queryClient: QueryClient;

  // Mutable server state
  let currentPreTasks: Task[] = [];
  let currentProcTasks: Task[] = [];
  let currentQaTasks: Task[] = [];
  let currentSingleTasks: Task[] = [];

  const mockWrPre: WorkRequest = {
    id: 'wr-soft-101',
    title: 'SEC Statutory Annual Filing',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'pre_processing',
    priority: 'High',
    clientId: 'client-1',
    clientName: 'Megaworld Corp',
    archived: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as WorkRequest;

  const mockWrProc: WorkRequest = {
    id: 'wr-soft-201',
    title: 'Financial Statement Audit',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'processing',
    priority: 'Medium',
    clientId: 'client-1',
    clientName: 'Megaworld Corp',
    archived: false,
    version: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as WorkRequest;

  const mockWrQa: WorkRequest = {
    id: 'wr-soft-301',
    title: 'BIR Tax Compliance Assessment',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'quality_assurance',
    priority: 'High',
    clientId: 'client-1',
    clientName: 'Megaworld Corp',
    archived: false,
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as WorkRequest;

  const mockWrSole: WorkRequest = {
    id: 'wr-soft-sole',
    title: 'Sole Blocker Work Request',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'pre_processing',
    priority: 'Medium',
    clientId: 'client-1',
    clientName: 'Megaworld Corp',
    archived: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as WorkRequest;

  const initialPreTasks: Task[] = [
    {
      id: 'task-pre-comp',
      workRequestId: 'wr-soft-101',
      title: 'Gather BIR Certificates',
      description: 'Collect all official tax certificates',
      status: 'Completed',
      phase: 'pre_processing',
      qaStatus: 'none',
      assigneeId: 'u-lead-1',
      assigneeName: 'Maria Santos',
      assignees: ['u-lead-1'],
      displayOrder: 1,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as Task,
    {
      id: 'task-pre-block',
      workRequestId: 'wr-soft-101',
      title: 'Verify General Ledger Accounts',
      description: 'Blocker task pending ledger reconciliations',
      status: 'In Progress',
      phase: 'pre_processing',
      qaStatus: 'none',
      assigneeId: 'u-staff-1',
      assigneeName: 'Juan Dela Cruz',
      assignees: ['u-staff-1'],
      displayOrder: 2,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as Task,
  ];

  const initialProcTasks: Task[] = [
    {
      id: 'task-proc-comp',
      workRequestId: 'wr-soft-201',
      title: 'Draft Financial Statement Notes',
      description: 'Notes to financials completed',
      status: 'Completed',
      phase: 'processing',
      qaStatus: 'none',
      assigneeId: 'u-lead-1',
      assigneeName: 'Maria Santos',
      assignees: ['u-lead-1'],
      displayOrder: 1,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as Task,
    {
      id: 'task-proc-block',
      workRequestId: 'wr-soft-201',
      title: 'Reconcile Asset Schedules',
      description: 'Asset schedule calculations pending',
      status: 'In Progress',
      phase: 'processing',
      qaStatus: 'none',
      assigneeId: 'u-staff-1',
      assigneeName: 'Juan Dela Cruz',
      assignees: ['u-staff-1'],
      displayOrder: 2,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as Task,
  ];

  const initialQaTasks: Task[] = [
    {
      id: 'task-qa-pass',
      workRequestId: 'wr-soft-301',
      title: 'Review Tax Computations',
      description: 'Verified tax rates',
      status: 'Completed',
      phase: 'quality_assurance',
      qaStatus: 'passed',
      assigneeId: 'u-lead-1',
      assigneeName: 'Maria Santos',
      assignees: ['u-lead-1'],
      displayOrder: 1,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as Task,
    {
      id: 'task-qa-fail',
      workRequestId: 'wr-soft-301',
      title: 'Check Annexure Formatting',
      description: 'Failed QA formatting check',
      status: 'Completed',
      phase: 'quality_assurance',
      qaStatus: 'failed',
      assigneeId: 'u-staff-1',
      assigneeName: 'Juan Dela Cruz',
      assignees: ['u-staff-1'],
      displayOrder: 2,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as Task,
  ];

  const mockDoc: DmsDocument = {
    id: 'doc-soft-1',
    workRequestId: 'wr-soft-101',
    linkedTaskId: 'task-pre-comp',
    originalName: 'Audit_Report_2026.pdf',
    fileName: 'Audit_Report_2026.pdf',
    documentType: 'Audit Report',
    category: 'LEGAL',
    status: 'active',
    fileSize: 1048576,
    contentType: 'application/pdf',
    uploaderId: 'u-lead-1',
    entityId: 'ATA',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as DmsDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('erp_feature_override_realtime_sync', 'true');
    clearChannelRegistryForTesting();
    useBlockingModalStore.getState().reset();

    currentPreTasks = structuredClone(initialPreTasks);
    currentProcTasks = structuredClone(initialProcTasks);
    currentQaTasks = structuredClone(initialQaTasks);
    currentSingleTasks = [
      {
        id: 'task-sole-blocker',
        workRequestId: 'wr-soft-sole',
        title: 'Sole Blocker Task',
        description: 'Single blocker task in phase',
        status: 'In Progress',
        phase: 'pre_processing',
        qaStatus: 'none',
        assigneeId: 'u-staff-1',
        assigneeName: 'Juan Dela Cruz',
        assignees: ['u-staff-1'],
        displayOrder: 1,
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      } as unknown as Task,
    ];

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        mutations: { retry: false },
      },
    });

    useSessionStore.getState().setSession({
      user: {
        id: 'u-lead-1',
        email: 'maria@ata-lta.ph',
        name: 'Maria Santos',
        role: 'Admin',
        departments: ['Operations', 'Accounting'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'workflow:phase_transition',
        'workflow:transition_request',
        'workflow:qa_review',
        'workflow:task_add',
        'billing:create',
        'billing:edit',
        'disbursement:create',
        'disbursement:edit',
        'transmittal:create',
        'transmittal:edit',
      ],
      activeEntity: 'ATA',
    });

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/me/team') || url.includes('/users')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'u-lead-1', name: 'Maria Santos', email: 'maria@ata-lta.ph', role: 'Admin' },
              { id: 'u-staff-1', name: 'Juan Dela Cruz', email: 'juan@ata-lta.ph', role: 'Staff' },
            ],
          }),
          { status: 200 }
        );
      }

      // WR Details
      if (url.includes('/operations/work-requests/wr-soft-101/tasks/')) {
        const taskId = url.split('/tasks/')[1]?.split('?')[0];
        const found = currentPreTasks.find((t) => t.id === taskId);
        return new Response(JSON.stringify({ data: found || null }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-soft-101/tasks')) {
        return new Response(JSON.stringify({ data: currentPreTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-soft-101')) {
        return new Response(JSON.stringify({ data: mockWrPre }), { status: 200 });
      }

      if (url.includes('/operations/work-requests/wr-soft-201/tasks')) {
        return new Response(JSON.stringify({ data: currentProcTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-soft-201')) {
        return new Response(JSON.stringify({ data: mockWrProc }), { status: 200 });
      }

      if (url.includes('/operations/work-requests/wr-soft-301/tasks')) {
        return new Response(JSON.stringify({ data: currentQaTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-soft-301')) {
        return new Response(JSON.stringify({ data: mockWrQa }), { status: 200 });
      }

      if (url.includes('/operations/work-requests/wr-soft-sole/tasks')) {
        return new Response(JSON.stringify({ data: currentSingleTasks }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-soft-sole')) {
        return new Response(JSON.stringify({ data: mockWrSole }), { status: 200 });
      }

      if (url.includes('/operations/work-requests?')) {
        return new Response(JSON.stringify({ data: [mockWrPre, mockWrProc, mockWrQa, mockWrSole] }), { status: 200 });
      }

      if (url.includes('/operations/tasks/') && url.includes('/related')) {
        return new Response(
          JSON.stringify({
            data: { invoices: [], disbursements: [], transmittals: [] },
          }),
          { status: 200 }
        );
      }

      if (url.includes('/documents?')) {
        return new Response(JSON.stringify({ data: [mockDoc] }), { status: 200 });
      }

      if (url.includes('/operations/requests?')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
  });

  afterEach(() => {
    queryClient.clear();
    clearChannelRegistryForTesting();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Soft-Delete Deselect & Eviction (Test 1)
  // ==========================================================================
  describe('Suite 1: Soft-Delete Deselect & Kanban Eviction', () => {
    it('1.1 (Canonical Test 1): soft-delete CDC UPDATE (deleted_at: now()) immediately deselects selectedTask, closes TaskDetailModal, and evicts card from Kanban board', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrPre]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-101'), mockWrPre);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-101'), currentPreTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-101" />
        </QueryClientProvider>
      );

      // Verify both cards render on board
      await screen.findByTestId('kanban-task-card-task-pre-comp');
      await screen.findByTestId('kanban-task-card-task-pre-block');
      expect(screen.getByText('Verify General Ledger Accounts')).toBeInTheDocument();

      // Click card 2 to open TaskDetailModal
      fireEvent.click(screen.getByTestId('kanban-task-card-task-pre-block'));

      // Verify modal is open and shows task title in DialogTitle
      await screen.findByTestId('task-close-btn');
      expect(screen.getByTestId('task-title')).toHaveTextContent('Verify General Ledger Accounts');

      // Update backend server state and emit CDC UPDATE with deleted_at = now()
      currentPreTasks = currentPreTasks.filter((t) => t.id !== 'task-pre-block');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');
      expect(channel).toBeDefined();

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-pre-block',
            work_request_id: 'wr-soft-101',
            title: 'Verify General Ledger Accounts',
            status: 'In Progress',
            deleted_at: new Date().toISOString(),
            version: 2,
          },
          old: {
            id: 'task-pre-block',
            work_request_id: 'wr-soft-101',
          },
        });
      });

      // Verify TaskDetailModal is closed immediately (selectedTask deselected)
      await waitFor(() => {
        expect(screen.queryByTestId('task-close-btn')).not.toBeInTheDocument();
      });

      // Verify the deleted task card is evicted from the Kanban board
      expect(screen.queryByTestId('kanban-task-card-task-pre-block')).not.toBeInTheDocument();
      expect(screen.queryByText('Verify General Ledger Accounts')).not.toBeInTheDocument();

      // Verify task-pre-comp remains on the board
      expect(screen.getByTestId('kanban-task-card-task-pre-comp')).toBeInTheDocument();
    });

    it('1.2 (Adversarial Variant): camelCase deletedAt in CDC UPDATE closes open TaskDetailModal and evicts card', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrPre]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-101'), mockWrPre);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-101'), currentPreTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-101" />
        </QueryClientProvider>
      );

      await screen.findByTestId('kanban-task-card-task-pre-comp');
      fireEvent.click(screen.getByTestId('kanban-task-card-task-pre-comp'));

      await screen.findByTestId('task-close-btn');
      expect(screen.getByTestId('task-title')).toHaveTextContent('Gather BIR Certificates');

      currentPreTasks = currentPreTasks.filter((t) => t.id !== 'task-pre-comp');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-pre-comp',
            work_request_id: 'wr-soft-101',
            title: 'Gather BIR Certificates',
            status: 'Completed',
            deletedAt: new Date().toISOString(),
            version: 2,
          },
          old: { id: 'task-pre-comp', work_request_id: 'wr-soft-101' },
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('task-close-btn')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('kanban-task-card-task-pre-comp')).not.toBeInTheDocument();
    });

    it('1.3 (Adversarial Variant): CDC DELETE event closes open TaskDetailModal and evicts card', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrPre]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-101'), mockWrPre);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-101'), currentPreTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-101" />
        </QueryClientProvider>
      );

      await screen.findByTestId('kanban-task-card-task-pre-block');
      fireEvent.click(screen.getByTestId('kanban-task-card-task-pre-block'));

      await screen.findByTestId('task-close-btn');
      expect(screen.getByTestId('task-title')).toHaveTextContent('Verify General Ledger Accounts');

      currentPreTasks = currentPreTasks.filter((t) => t.id !== 'task-pre-block');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'DELETE',
          old: { id: 'task-pre-block', work_request_id: 'wr-soft-101' },
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('task-close-btn')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('kanban-task-card-task-pre-block')).not.toBeInTheDocument();
    });

    it('1.4 (Adversarial Boundary): soft-deleting an unselected task does NOT close the currently open modal', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrPre]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-101'), mockWrPre);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-101'), currentPreTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-101" />
        </QueryClientProvider>
      );

      await screen.findByTestId('kanban-task-card-task-pre-comp');
      // User opens task-pre-comp
      fireEvent.click(screen.getByTestId('kanban-task-card-task-pre-comp'));
      await screen.findByTestId('task-close-btn');
      expect(screen.getByTestId('task-title')).toHaveTextContent('Gather BIR Certificates');

      // Now task-pre-block (the other task) is soft-deleted
      currentPreTasks = currentPreTasks.filter((t) => t.id !== 'task-pre-block');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-pre-block',
            work_request_id: 'wr-soft-101',
            deleted_at: new Date().toISOString(),
          },
          old: { id: 'task-pre-block', work_request_id: 'wr-soft-101' },
        });
      });

      // Modal for task-pre-comp must remain open!
      expect(screen.getByTestId('task-close-btn')).toBeInTheDocument();
      expect(screen.getByTestId('task-title')).toHaveTextContent('Gather BIR Certificates');

      // But card for task-pre-block must be evicted from the Kanban column
      await waitFor(() => {
        expect(screen.queryByTestId('kanban-task-card-task-pre-block')).not.toBeInTheDocument();
      });
    });

    it('1.5 (Adversarial Deep-Link): URL query ?taskId=xxx with soft-deleted task rejects auto-opening modal', async () => {
      const softDeletedList: Task[] = [
        {
          ...initialPreTasks[0]!,
          id: 'task-soft-deep',
          deleted_at: '2026-10-10T12:00:00Z',
        } as unknown as Task,
      ];
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrPre]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-101'), mockWrPre);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-101'), softDeletedList);

      delete (window as unknown as { location?: unknown }).location;
      (window as unknown as { location: { search: string } }).location = {
        search: '?taskId=task-soft-deep',
      };

      render(
        <QueryClientProvider client={queryClient}>
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-101" />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('task-close-btn')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('kanban-task-card-task-soft-deep')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Suite 2: Gate Unblocking on Soft-Delete (Test 2)
  // ==========================================================================
  describe('Suite 2: Gate Unblocking on Soft-Delete', () => {
    it('2.1 (Canonical Test 2 - pre_processing): soft-deleting incomplete task unblocks gate and enables canAdvance', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrPre]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-101'), mockWrPre);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-101'), currentPreTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-101" />
        </QueryClientProvider>
      );

      // Initially: task-pre-block is In Progress, blocking pre_processing advance
      await screen.findByTestId('gate-blocker-pre_processing');
      expect(screen.getByTestId('gate-blocker-pre_processing')).toHaveTextContent('1 task(s) block advancement');
      const advanceBtn = screen.getByTestId('admin-advance-btn');
      expect(advanceBtn).toBeDisabled();

      // Soft-delete task-pre-block
      currentPreTasks = currentPreTasks.filter((t) => t.id !== 'task-pre-block');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-pre-block',
            work_request_id: 'wr-soft-101',
            status: 'In Progress',
            deleted_at: new Date().toISOString(),
          },
          old: { id: 'task-pre-block', work_request_id: 'wr-soft-101' },
        });
      });

      // Blocker warning must immediately disappear
      await waitFor(() => {
        expect(screen.queryByTestId('gate-blocker-pre_processing')).not.toBeInTheDocument();
      });

      // Advance button becomes enabled
      expect(screen.getByTestId('admin-advance-btn')).toBeEnabled();

      // Gate progress shows 1/1 completed
      expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('1/1 completed');
    });

    it('2.2 (Canonical Test 2 - processing): soft-deleting incomplete processing task unblocks gate', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrProc]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-201'), mockWrProc);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-201'), currentProcTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-201" />
        </QueryClientProvider>
      );

      // Initially: task-proc-block blocks advancement in processing
      await screen.findByTestId('gate-blocker-processing');
      expect(screen.getByTestId('gate-blocker-processing')).toHaveTextContent('1 task(s) block advancement');
      const procAdvanceBtn = screen.getByTestId('admin-advance-btn');
      expect(procAdvanceBtn).toBeDisabled();

      // Soft-delete task-proc-block
      currentProcTasks = currentProcTasks.filter((t) => t.id !== 'task-proc-block');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-proc-block',
            work_request_id: 'wr-soft-201',
            status: 'In Progress',
            deleted_at: new Date().toISOString(),
          },
          old: { id: 'task-proc-block', work_request_id: 'wr-soft-201' },
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('gate-blocker-processing')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('admin-advance-btn')).toBeEnabled();
      expect(screen.getByTestId('gate-progress-processing')).toHaveTextContent('1/1 completed');
    });

    it('2.3 (Adversarial Variant - quality_assurance): soft-deleting failed QA task removes Failed badge and enables advance to Completion', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrQa]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-301'), mockWrQa);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-301'), currentQaTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-301" />
        </QueryClientProvider>
      );

      // Initially: task-qa-fail is failed, showing red badge and disabling advance
      await screen.findByText('1 Failed QA');
      const qaAdvanceBtn = screen.getByTestId('admin-advance-completion-btn');
      expect(qaAdvanceBtn).toBeDisabled();

      // Soft-delete task-qa-fail
      currentQaTasks = currentQaTasks.filter((t) => t.id !== 'task-qa-fail');
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-qa-fail',
            work_request_id: 'wr-soft-301',
            status: 'Completed',
            qa_status: 'failed',
            deleted_at: new Date().toISOString(),
          },
          old: { id: 'task-qa-fail', work_request_id: 'wr-soft-301' },
        });
      });

      // Failed QA badge disappears
      await waitFor(() => {
        expect(screen.queryByText('1 Failed QA')).not.toBeInTheDocument();
      });

      // QA advance to completion button becomes enabled
      expect(screen.getByTestId('admin-advance-completion-btn')).toBeEnabled();
    });

    it('2.4 (Adversarial Boundary): soft-deleting the ONLY task does NOT unblock advance (phase total becomes 0)', async () => {
      queryClient.setQueryData(operationsKeys.workRequests(), [mockWrSole]);
      queryClient.setQueryData(operationsKeys.workRequestDetail('wr-soft-sole'), mockWrSole);
      queryClient.setQueryData(operationsKeys.tasks('wr-soft-sole'), currentSingleTasks);

      render(
        <QueryClientProvider client={queryClient}>
          <RealtimeTasksSync />
          <PhaseKanbanBoard initialWorkRequestId="wr-soft-sole" />
        </QueryClientProvider>
      );

      await screen.findByTestId('gate-blocker-pre_processing');
      expect(screen.getByTestId('admin-advance-btn')).toBeDisabled();

      // Soft-delete the only task in this phase
      currentSingleTasks = [];
      const mockClient = supabase as unknown as MockSupabaseClient;
      const channel = mockClient.getChannel('cdc_tasks');

      act(() => {
        channel?.emit('postgres_changes', {
          eventType: 'UPDATE',
          new: {
            id: 'task-sole-blocker',
            work_request_id: 'wr-soft-sole',
            deleted_at: new Date().toISOString(),
          },
          old: { id: 'task-sole-blocker', work_request_id: 'wr-soft-sole' },
        });
      });

      // Blocker disappears because there are no incomplete tasks remaining
      await waitFor(() => {
        expect(screen.queryByTestId('gate-blocker-pre_processing')).not.toBeInTheDocument();
      });

      // But canAdvance is false because preTasks.length === 0 (cannot advance empty phase)
      expect(screen.getByTestId('admin-advance-btn')).toBeDisabled();
      expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('0/0');
    });
  });

  // ==========================================================================
  // Suite 3: Child Modal Close Invalidation (Test 3)
  // ==========================================================================
  describe('Suite 3: Child Modal Close Invalidation', () => {
    it('3.1 (InvoiceCreateModal): closing or creating invoice triggers queryClient.invalidateQueries(operationsKeys.taskRelated(task.id))', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const task = initialPreTasks[0]!;

      render(
        <QueryClientProvider client={queryClient}>
          <TaskDetailModal
            isOpen={true}
            onClose={vi.fn()}
            task={task}
            workRequest={mockWrPre}
          />
        </QueryClientProvider>
      );

      // Open InvoiceCreateModal
      const linkInvBtn = await screen.findByTestId('link-invoice-btn');
      fireEvent.click(linkInvBtn);
      await screen.findByTestId('mock-invoice-create-modal');

      // 1. Trigger onClose
      fireEvent.click(screen.getByTestId('close-invoice-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });

      // 2. Re-open and trigger onCreated
      fireEvent.click(screen.getByTestId('link-invoice-btn'));
      await screen.findByTestId('mock-invoice-create-modal');
      invalidateSpy.mockClear();

      fireEvent.click(screen.getByTestId('created-invoice-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });
    });

    it('3.2 (CreateDisbursementModal): closing or creating disbursement triggers queryClient.invalidateQueries(operationsKeys.taskRelated(task.id))', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const task = initialPreTasks[0]!;

      render(
        <QueryClientProvider client={queryClient}>
          <TaskDetailModal
            isOpen={true}
            onClose={vi.fn()}
            task={task}
            workRequest={mockWrPre}
          />
        </QueryClientProvider>
      );

      // Open CreateDisbursementModal
      const linkDisbBtn = await screen.findByTestId('link-disbursement-btn');
      fireEvent.click(linkDisbBtn);
      await screen.findByTestId('mock-disbursement-create-modal');

      // 1. Trigger onClose
      fireEvent.click(screen.getByTestId('close-disbursement-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });

      // 2. Re-open and trigger onSuccess
      fireEvent.click(screen.getByTestId('link-disbursement-btn'));
      await screen.findByTestId('mock-disbursement-create-modal');
      invalidateSpy.mockClear();

      fireEvent.click(screen.getByTestId('success-disbursement-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });
    });

    it('3.3 (TransmittalFormModal): closing transmittal form triggers queryClient.invalidateQueries(operationsKeys.taskRelated(task.id))', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const task = initialPreTasks[0]!;

      render(
        <QueryClientProvider client={queryClient}>
          <TaskDetailModal
            isOpen={true}
            onClose={vi.fn()}
            task={task}
            workRequest={mockWrPre}
          />
        </QueryClientProvider>
      );

      // Open TransmittalFormModal
      const linkTransBtn = await screen.findByTestId('link-transmittal-btn');
      fireEvent.click(linkTransBtn);
      await screen.findByTestId('mock-transmittal-form-modal');

      // Trigger onClose
      fireEvent.click(screen.getByTestId('close-transmittal-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });
    });

    it('3.4 (DocumentUploadModal): closing or completing upload triggers queryClient.invalidateQueries(operationsKeys.taskRelated(task.id)) and operationsKeys.documents()', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const task = initialPreTasks[0]!;

      render(
        <QueryClientProvider client={queryClient}>
          <TaskDetailModal
            isOpen={true}
            onClose={vi.fn()}
            task={task}
            workRequest={mockWrPre}
          />
        </QueryClientProvider>
      );

      // Open DocumentUploadModal
      const uploadBtn = await screen.findByTestId('task-upload-doc-btn');
      fireEvent.click(uploadBtn);
      await screen.findByTestId('mock-document-upload-modal');

      // 1. Trigger onClose
      fireEvent.click(screen.getByTestId('close-document-upload-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });

      // 2. Re-open and trigger onSuccess
      fireEvent.click(screen.getByTestId('task-upload-doc-btn'));
      await screen.findByTestId('mock-document-upload-modal');
      invalidateSpy.mockClear();

      fireEvent.click(screen.getByTestId('success-document-upload-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.documents(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });
    });

    it('3.5 (DocumentViewerModal): closing viewer or completing version upload triggers queryClient.invalidateQueries(operationsKeys.taskRelated(task.id)) and operationsKeys.documents()', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const task = initialPreTasks[0]!;

      render(
        <QueryClientProvider client={queryClient}>
          <TaskDetailModal
            isOpen={true}
            onClose={vi.fn()}
            task={task}
            workRequest={mockWrPre}
          />
        </QueryClientProvider>
      );

      // Document list item rendered
      const docItem = await screen.findByTestId('linked-doc-item-doc-soft-1');
      fireEvent.click(docItem);
      await screen.findByTestId('mock-document-viewer-modal');

      // 1. Trigger onClose
      fireEvent.click(screen.getByTestId('close-document-viewer-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.documents(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });

      // 2. Re-open and trigger onUploadSuccess
      fireEvent.click(screen.getByTestId('linked-doc-item-doc-soft-1'));
      await screen.findByTestId('mock-document-viewer-modal');
      invalidateSpy.mockClear();

      fireEvent.click(screen.getByTestId('success-document-viewer-modal-btn'));
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.documents(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated(task.id),
      });
    });
  });
});
