import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore, type UserProfile } from '@/lib/session';
import { WorkRequestSidePeek } from '../components/WorkRequestSidePeek';
import { WORK_REQUEST_STATUS_OPTIONS, type WorkRequest, type Task, type DmsDocument } from '../api/types';

const mockTask: Task = {
  id: 'task-peek-1',
  workRequestId: 'wr-peek-1',
  title: 'Review Financial Statements',
  description: 'Detailed analysis of Q1 statements',
  status: 'In Progress',
  phase: 'processing',
  qaStatus: 'none',
  phaseEnteredAt: '2026-03-01T00:00:00Z',
  assigneeId: 'user-emp-1',
  assigneeName: 'Alice Staff',
  assignees: ['user-emp-1'],
  predecessors: [],
  dueDate: '2026-04-15T00:00:00Z',
  requiredLinkType: null,
  displayOrder: 1,
  version: 1,
  checklist: [
    { id: 'chk-1', text: 'Verify income entries', completed: true },
    { id: 'chk-2', text: 'Cross-check bank reconciliation', completed: false },
  ],
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const mockDoc: DmsDocument = {
  id: 'doc-peek-1',
  fileName: 'Financial_Report_Q1.pdf',
  file_name: 'Financial_Report_Q1.pdf',
  originalName: 'Financial_Report_Q1.pdf',
  original_name: 'Financial_Report_Q1.pdf',
  workRequestId: 'wr-peek-1',
  work_request_id: 'wr-peek-1',
  linkedTaskId: 'task-peek-1',
  linked_task_id: 'task-peek-1',
  clientId: 'c-1',
  client_id: 'c-1',
  documentType: 'PDF',
  document_type: 'PDF',
  category: 'FINANCIAL',
  uploaderId: 'user-admin',
  uploader_id: 'user-admin',
  description: 'Preliminary Q1 balance sheet',
  entity_id: 'ATA',
  status: 'active',
  document_lifecycle: 'collected',
  archived: false,
  fileSize: 1048576,
  file_size: 1048576,
  contentType: 'application/pdf',
  content_type: 'application/pdf',
  storage_path: 'documents/wr-peek-1/Financial_Report_Q1.pdf',
  external_url: null,
  comments: [],
  versions: [],
  createdAt: '2026-03-01T00:00:00Z',
  created_at: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
};

const mockWr: WorkRequest = {
  id: 'wr-peek-1',
  title: 'Corporate Year-End Audit',
  description: 'Perform complete statutory audit and financial compliance',
  entity: 'ATA',
  clientId: 'c-1',
  clientName: 'Alpha Logistics Phils',
  status: 'In Progress',
  phase: 'processing',
  priority: 'High',
  archived: false,
  onHold: false,
  phaseEnteredAt: '2026-03-01T00:00:00Z',
  dueDate: '2026-04-30T00:00:00Z',
  requestedBy: 'user-client',
  assignedTo: 'user-mgr-1',
  assignedToName: 'Jane Manager',
  coAssignees: ['user-emp-1'],
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  tasks: [mockTask],
};

const userAdmin: UserProfile = {
  id: 'user-admin',
  email: 'lorein@ata-lta.ph',
  name: 'Lorein Wong',
  role: 'Admin',
  departments: ['Management'],
  entities: ['ATA', 'LTA'],
};

const userStaff: UserProfile = {
  id: 'user-emp-1',
  email: 'alice@ata-lta.ph',
  name: 'Alice Staff',
  role: 'Staff',
  departments: ['Operations'],
  entities: ['ATA'],
};

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}

describe('WorkRequestSidePeek Enhanced Notion-like Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/operations/work-requests/wr-peek-1/tasks')) {
        return new Response(JSON.stringify({ data: [mockTask] }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-peek-1')) {
        return new Response(JSON.stringify({ data: mockWr }), { status: 200 });
      }
      if (url.includes('/documents/doc-peek-1/download-url')) {
        return new Response(
          JSON.stringify({
            data: {
              url: 'https://storage.supabase.co/Financial_Report_Q1.pdf',
              fileName: 'Financial_Report_Q1.pdf',
              contentType: 'application/pdf',
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/documents')) {
        return new Response(JSON.stringify({ data: [mockDoc] }), { status: 200 });
      }
      if (url.includes('/me/team')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'user-mgr-1', name: 'Jane Manager', role: 'Manager' },
              { id: 'user-emp-1', name: 'Alice Staff', role: 'Staff' },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders all 12 status options in WORK_REQUEST_STATUS_OPTIONS', () => {
    expect(WORK_REQUEST_STATUS_OPTIONS).toEqual([
      'Received',
      'For Client Approval',
      'For Requirements',
      'Pending Requirements',
      'For Assignment',
      'In Progress',
      'For Supervisor Review',
      'For Billing',
      'For Payment',
      'For Submission',
      'For Quality Check',
      'Completed',
    ]);
  });

  it('allows Admin to open the status dropdown and select a new status freely', async () => {
    useSessionStore.getState().setSession({
      user: userAdmin,
      permissions: ['workflow:view', 'workflow:edit'],
      activeEntity: 'ATA',
    });

    let patchedData: unknown = null;
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/operations/work-requests/wr-peek-1') && init?.method === 'PUT') {
        patchedData = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ data: { ...mockWr, status: 'For Supervisor Review' } }), {
          status: 200,
        });
      }
      if (url.includes('/operations/work-requests/wr-peek-1/tasks')) {
        return new Response(JSON.stringify({ data: [mockTask] }), { status: 200 });
      }
      if (url.includes('/operations/work-requests/wr-peek-1')) {
        return new Response(JSON.stringify({ data: mockWr }), { status: 200 });
      }
      if (url.includes('/documents')) {
        return new Response(JSON.stringify({ data: [mockDoc] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const { wrapper } = createTestHarness();
    render(
      <WorkRequestSidePeek
        isOpen={true}
        workRequestId="wr-peek-1"
        onClose={vi.fn()}
      />,
      { wrapper }
    );

    // Wait for title
    await waitFor(() => {
      expect(screen.getByTestId('side-peek-title')).toHaveTextContent('Corporate Year-End Audit');
    });

    // Check status dropdown trigger
    const statusBtn = screen.getByTestId('side-peek-status');
    expect(statusBtn).toHaveAttribute('data-admin-status-dropdown', 'true');

    // Trigger dropdown opening
    fireEvent.pointerDown(statusBtn, { button: 0, ctrlKey: false });
    fireEvent.keyDown(statusBtn, { key: 'ArrowDown', code: 'ArrowDown' });

    // Verify status options are rendered
    await waitFor(() => {
      expect(screen.getByTestId('status-option-For Supervisor Review')).toBeInTheDocument();
      expect(screen.getByTestId('status-option-Received')).toBeInTheDocument();
      expect(screen.getByTestId('status-option-Completed')).toBeInTheDocument();
    });

    // Click "For Supervisor Review"
    fireEvent.click(screen.getByTestId('status-option-For Supervisor Review'));

    await waitFor(() => {
      expect(patchedData).toEqual({ status: 'For Supervisor Review' });
    });
  });

  it('renders read-only status pill for non-admin users without dropdown trigger', async () => {
    useSessionStore.getState().setSession({
      user: userStaff,
      permissions: ['workflow:view'],
      activeEntity: 'ATA',
    });

    const { wrapper } = createTestHarness();
    render(
      <WorkRequestSidePeek
        isOpen={true}
        workRequestId="wr-peek-1"
        onClose={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId('side-peek-title')).toHaveTextContent('Corporate Year-End Audit');
    });

    const statusBadge = screen.getByTestId('side-peek-status');
    expect(statusBadge.tagName.toLowerCase()).toBe('span');
    expect(statusBadge).not.toHaveAttribute('data-admin-status-dropdown');
  });

  it('renders attached documents with preview capability inside sidepeek', async () => {
    useSessionStore.getState().setSession({
      user: userAdmin,
      permissions: ['workflow:view'],
      activeEntity: 'ATA',
    });

    const { wrapper } = createTestHarness();
    render(
      <WorkRequestSidePeek
        isOpen={true}
        workRequestId="wr-peek-1"
        onClose={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Financial_Report_Q1.pdf')).toBeInTheDocument();
    });

    // Click Preview button
    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    fireEvent.click(previewBtn);

    // Verify inline previewer panel appears and resolves iframe
    await waitFor(() => {
      expect(screen.getByText(/Previewing: Financial_Report_Q1.pdf/i)).toBeInTheDocument();
      expect(screen.getByTestId('inline-doc-preview-frame')).toBeInTheDocument();
    });
  });

  it('allows clicking tasks or details to open TaskDetailModal', async () => {
    useSessionStore.getState().setSession({
      user: userAdmin,
      permissions: ['workflow:view', 'workflow:edit'],
      activeEntity: 'ATA',
    });

    const { wrapper } = createTestHarness();
    render(
      <WorkRequestSidePeek
        isOpen={true}
        workRequestId="wr-peek-1"
        onClose={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Review Financial Statements')).toBeInTheDocument();
    });

    // Click "Details" button on task
    const detailsBtn = screen.getByRole('button', { name: /Details/i });
    fireEvent.click(detailsBtn);

    // Verify TaskDetailModal is mounted
    await waitFor(() => {
      expect(screen.getByTestId('task-detail-modal')).toBeInTheDocument();
    });
  });
});
