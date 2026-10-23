import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useSessionStore } from '@/lib/session';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { operationsKeys } from '../api/queryKeys';
import type { Task, WorkRequest } from '../api/types';

// Mock DocumentUploadModal to inspect props passed by TaskDetailModal
const mockDocumentUploadModalProps: Record<string, unknown>[] = [];
vi.mock('@/features/documents/components/DocumentUploadModal', () => ({
  DocumentUploadModal: (props: Record<string, unknown>) => {
    mockDocumentUploadModalProps.push(props);
    return (
      <div data-testid="mock-document-upload-modal">
        <span data-testid="mock-task-id">{String(props.defaultTaskId || '')}</span>
        <span data-testid="mock-wr-id">{String(props.defaultWorkRequestId || '')}</span>
        <button
          type="button"
          data-testid="mock-upload-success-btn"
          onClick={() => {
            if (typeof props.onSuccess === 'function') {
              props.onSuccess({ id: 'doc-uploaded', linked_task_id: props.defaultTaskId });
            }
          }}
        >
          Simulate Upload Success
        </button>
        <button
          type="button"
          data-testid="mock-upload-close-btn"
          onClick={() => {
            if (typeof props.onClose === 'function') {
              props.onClose();
            }
          }}
        >
          Simulate Close
        </button>
      </div>
    );
  },
}));

// Mock useDocuments to provide task-linked document data and spy on refetchDocs
const mockRefetchDocs = vi.fn();
const mockDocsList = [
  {
    id: 'doc-task-linked',
    file_name: 'Audit_Report.pdf',
    original_name: 'Audit Report.pdf',
    fileName: 'Audit Report.pdf',
    originalName: 'Audit Report.pdf',
    category: 'FINANCIAL',
    workRequestId: 'wr-888',
    work_request_id: 'wr-888',
    linkedTaskId: 'task-777',
    linked_task_id: 'task-777',
    status: 'active',
  },
];

vi.mock('../api/useDocuments', () => ({
  useDocuments: () => ({
    data: mockDocsList,
    isLoading: false,
    refetch: mockRefetchDocs,
  }),
}));

const mockTask: Task = {
  id: 'task-777',
  workRequestId: 'wr-888',
  title: 'Audit Execution Task',
  description: 'Perform compliance audit steps',
  status: 'In Progress',
  phase: 'processing',
  qaStatus: 'none',
  phaseEnteredAt: '2026-03-01T00:00:00Z',
  assigneeId: 'user-admin',
  assigneeName: 'Lorein Wong',
  assignees: ['user-admin'],
  taskAssignees: [
    {
      taskId: 'task-777',
      userId: 'user-admin',
      assignedBy: null,
      assignedAt: null,
      userName: 'Lorein Wong',
    },
  ],
  predecessors: [],
  dueDate: '2026-04-15T00:00:00Z',
  requiredLinkType: null,
  displayOrder: 1,
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const mockWr: WorkRequest = {
  id: 'wr-888',
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
  phaseEnteredAt: '2026-03-01T00:00:00Z',
  dueDate: '2026-04-30T00:00:00Z',
  requestedBy: 'user-req-1',
  assignedTo: 'user-admin',
  assignedToName: 'Lorein Wong',
  coAssignees: [],
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  tasks: [mockTask],
};

describe('TaskDetailModal Document Linking & Query Invalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockDocumentUploadModalProps.length = 0;
    mockRefetchDocs.mockReset();
    vi.clearAllMocks();

    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'lorein@ata-lta.ph',
        name: 'Lorein Wong',
        role: 'Admin',
        departments: ['Operations'],
        entities: ['ATA'],
      },
      permissions: ['workflow:view', 'workflow:edit'],
      activeEntity: 'ATA',
    });

    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    cleanup();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('passes defaultTaskId={task.id} to DocumentUploadModal when opening upload modal from task', async () => {
    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper }
    );

    // Click Upload Document button
    const uploadBtn = screen.getByTestId('task-upload-doc-btn');
    expect(uploadBtn).toBeInTheDocument();
    fireEvent.click(uploadBtn);

    // Verify mock modal is rendered with defaultTaskId
    await waitFor(() => {
      expect(screen.getByTestId('mock-document-upload-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mock-task-id')).toHaveTextContent('task-777');
    expect(screen.getByTestId('mock-wr-id')).toHaveTextContent('wr-888');

    const lastProps = mockDocumentUploadModalProps[mockDocumentUploadModalProps.length - 1];
    expect(lastProps?.defaultTaskId).toBe('task-777');
    expect(lastProps?.defaultWorkRequestId).toBe('wr-888');
    expect(lastProps?.defaultClientId).toBe('client-101');
  });

  it('invalidates task-related queries when DocumentUploadModal is closed', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByTestId('task-upload-doc-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-upload-close-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mock-upload-close-btn'));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated('task-777'),
      });
    });
  });

  it('invalidates task-related queries, documents, and refetches docs on upload success', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByTestId('task-upload-doc-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-upload-success-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mock-upload-success-btn'));

    await waitFor(() => {
      expect(mockRefetchDocs).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.taskRelated('task-777'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: operationsKeys.documents(),
      });
    });
  });

  it('renders linked documents filtered to current task', async () => {
    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId('linked-doc-item-doc-task-linked')).toBeInTheDocument();
      expect(screen.getByText('Audit Report.pdf')).toBeInTheDocument();
    });
  });

  it('renders editable task type selector when user has workflow:edit and read-only badge otherwise', async () => {
    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={mockTask}
        workRequest={mockWr}
      />,
      { wrapper }
    );

    const typeSelect = screen.getByTestId('task-detail-type-select');
    expect(typeSelect).toBeInTheDocument();
    expect(typeSelect).toHaveValue('');

    fireEvent.change(typeSelect, { target: { value: 'billing' } });
    expect(typeSelect).toHaveValue('billing');

    cleanup();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-staff',
        email: 'staff@ata-lta.ph',
        name: 'Staff User',
        role: 'Operations',
        departments: ['Operations'],
        entities: ['ATA'],
      },
      permissions: ['workflow:view'],
      activeEntity: 'ATA',
    });

    render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={{ ...mockTask, requiredLinkType: 'documents' }}
        workRequest={mockWr}
      />,
      { wrapper }
    );

    expect(screen.queryByTestId('task-detail-type-select')).toBeNull();
    expect(screen.getByTestId('task-detail-type-badge')).toHaveTextContent('Documents');
  });

  it('locks task actions when task phase does not match active work request phase and unlocks when rerouted back', () => {
    // 1. Task is in pre_processing, but WR has moved to processing -> locked
    const { rerender } = render(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={{ ...mockTask, phase: 'pre_processing', qaStatus: 'none' }}
        workRequest={{ ...mockWr, phase: 'processing' }}
      />,
      { wrapper }
    );

    expect(screen.getByTestId('phase-locked-banner')).toBeInTheDocument();
    expect(screen.getByText('Phase Completed (Locked)')).toBeInTheDocument();
    expect(screen.getByTestId('task-toggle-status-btn')).toBeDisabled();
    expect(screen.getByTestId('task-upload-doc-btn')).toBeDisabled();

    // 2. WR is in quality_assurance -> task in pre_processing is still locked and shows QA: Under Review
    rerender(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={{ ...mockTask, phase: 'pre_processing', qaStatus: 'none' }}
        workRequest={{ ...mockWr, phase: 'quality_assurance' }}
      />
    );
    expect(screen.getByTestId('phase-locked-banner')).toBeInTheDocument();
    expect(screen.getByText('QA: Under Review')).toBeInTheDocument();
    expect(screen.getByTestId('task-toggle-status-btn')).toBeDisabled();
    expect(screen.getByTestId('task-upload-doc-btn')).toBeDisabled();

    // 3. Admin reroutes WR back to pre_processing -> task unlocks
    rerender(
      <TaskDetailModal
        isOpen={true}
        onClose={vi.fn()}
        task={{ ...mockTask, phase: 'pre_processing', qaStatus: 'none' }}
        workRequest={{ ...mockWr, phase: 'pre_processing' }}
      />
    );
    expect(screen.queryByTestId('phase-locked-banner')).toBeNull();
    expect(screen.getByText('Active Phase')).toBeInTheDocument();
    expect(screen.getByTestId('task-toggle-status-btn')).not.toBeDisabled();
    expect(screen.getByTestId('task-upload-doc-btn')).not.toBeDisabled();
  });
});
