import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore, type UserProfile } from '@/lib/session';
import { useBlockingModalStore } from '../components/BlockingActionModal';
import { TaskDetailModal } from '../components/TaskDetailModal';
import {
  isTaskAssignee,
  isWrTeamMember,
  isUserAdmin,
  canMutateTaskStatus,
  canLogTaskTime,
  canUploadTaskDocument,
  canLinkInvoice,
  canLinkTransmittal,
  canLinkDisbursement,
  canRequestInvoice,
  canRequestTransmittal,
} from '../lib/taskScope';
import type { Task, WorkRequest } from '../api/types';

const mockTask: Task = {
  id: 'task-scope-1',
  workRequestId: 'wr-scope-1',
  title: 'Quarterly Review Audit',
  description: 'Detailed financial worksheets review',
  status: 'In Progress',
  phase: 'processing',
  qaStatus: 'none',
  phaseEnteredAt: '2026-03-01T00:00:00Z',
  assigneeId: 'emp-assigned-1',
  assigneeName: 'Assigned Lead Staff',
  assignees: ['emp-assigned-1', 'emp-assigned-2'],
  taskAssignees: [
    { taskId: 'task-scope-1', userId: 'emp-assigned-1', assignedBy: null, assignedAt: null, userName: 'Assigned Lead Staff' },
    { taskId: 'task-scope-1', userId: 'emp-assigned-2', assignedBy: null, assignedAt: null, userName: 'Assigned Co Staff' },
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
  id: 'wr-scope-1',
  title: 'Q1 Corporate Review',
  description: 'Detailed financial worksheets review',
  entity: 'ATA',
  clientId: 'client-1',
  clientName: 'Alpha Corp',
  phase: 'processing',
  status: 'In Progress',
  priority: 'High',
  archived: false,
  onHold: false,
  phaseEnteredAt: '2026-03-01T00:00:00Z',
  dueDate: '2026-04-30T00:00:00Z',
  requestedBy: 'user-req-1',
  assignedTo: 'mgr-lead-1',
  assignedToName: 'Manager Lead',
  coAssignees: ['emp-assigned-1', 'emp-assigned-2', 'emp-accounting-1', 'emp-doc-1'],
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  tasks: [mockTask],
};

const userAdmin: UserProfile = {
  id: 'user-lorein',
  email: 'lorein@ata-lta.ph',
  name: 'Lorein Wong',
  role: 'Admin',
  departments: ['Management'],
  entities: ['ATA', 'LTA'],
};

const userAssignedStaff: UserProfile = {
  id: 'emp-assigned-1',
  email: 'worker1@ata-lta.ph',
  name: 'Assigned Lead Staff',
  role: 'Staff',
  departments: ['Operations'],
  entities: ['ATA', 'LTA'],
};

const userUnassignedManager: UserProfile = {
  id: 'mgr-unassigned',
  email: 'unassigned.mgr@ata-lta.ph',
  name: 'Unassigned Manager',
  role: 'Manager',
  departments: ['Operations'],
  entities: ['ATA', 'LTA'],
};

const userAccountingTeam: UserProfile = {
  id: 'emp-accounting-1',
  email: 'acct@ata-lta.ph',
  name: 'Accounting Staff',
  role: 'Staff',
  departments: ['Accounting'],
  entities: ['ATA', 'LTA'],
};

const userDocTeam: UserProfile = {
  id: 'emp-doc-1',
  email: 'doc@ata-lta.ph',
  name: 'Documentation Staff',
  role: 'Staff',
  departments: ['Documentation'],
  entities: ['ATA', 'LTA'],
};

describe('Task Scoping Utility Unit Tests (taskScope.ts)', () => {
  it('correctly determines task assignee membership', () => {
    expect(isTaskAssignee(userAssignedStaff, mockTask)).toBe(true);
    expect(isTaskAssignee({ ...userAssignedStaff, id: 'emp-assigned-2' }, mockTask)).toBe(true);
    expect(isTaskAssignee(userUnassignedManager, mockTask)).toBe(false);
    expect(isTaskAssignee(userAdmin, mockTask)).toBe(false);
  });

  it('correctly determines work request team membership', () => {
    expect(isWrTeamMember(userAccountingTeam, mockWr, [mockTask])).toBe(true);
    expect(isWrTeamMember(userUnassignedManager, mockWr, [mockTask])).toBe(false);
    expect(isWrTeamMember(userAssignedStaff, mockWr, [mockTask])).toBe(true);
  });

  it('correctly identifies Admin users including Lorein Wong', () => {
    expect(isUserAdmin(userAdmin)).toBe(true);
    expect(isUserAdmin({ id: 'any-id', email: 'lorein@ata-lta.ph', name: 'Lorein Wong', role: 'Staff', departments: [], entities: [] })).toBe(true);
    expect(isUserAdmin(userAssignedStaff)).toBe(false);
    expect(isUserAdmin(userUnassignedManager)).toBe(false);
  });

  it('enforces status mutation permissions (only assigned employee or Admin)', () => {
    expect(canMutateTaskStatus(userAssignedStaff, mockTask)).toBe(true);
    expect(canMutateTaskStatus(userAdmin, mockTask)).toBe(true);
    expect(canMutateTaskStatus(userUnassignedManager, mockTask)).toBe(false);
    expect(canMutateTaskStatus(userAccountingTeam, mockTask)).toBe(false);
  });

  it('enforces time logging permissions (only assigned employee or Admin)', () => {
    expect(canLogTaskTime(userAssignedStaff, mockTask)).toBe(true);
    expect(canLogTaskTime(userAdmin, mockTask)).toBe(true);
    expect(canLogTaskTime(userUnassignedManager, mockTask)).toBe(false);
    expect(canLogTaskTime(userAccountingTeam, mockTask)).toBe(false);
  });

  it('enforces document upload permissions (only assigned employee or Admin)', () => {
    expect(canUploadTaskDocument(userAssignedStaff, mockTask)).toBe(true);
    expect(canUploadTaskDocument(userAdmin, mockTask)).toBe(true);
    expect(canUploadTaskDocument(userUnassignedManager, mockTask)).toBe(false);
    expect(canUploadTaskDocument(userDocTeam, mockTask)).toBe(false);
  });

  it('enforces billing invoice permissions (Admin, assigned, Accounting in WR; others request)', () => {
    // Direct link
    expect(canLinkInvoice(userAdmin, mockTask, mockWr, [mockTask])).toBe(true);
    expect(canLinkInvoice(userAssignedStaff, mockTask, mockWr, [mockTask])).toBe(true);
    expect(canLinkInvoice(userAccountingTeam, mockTask, mockWr, [mockTask])).toBe(true);
    expect(canLinkInvoice(userUnassignedManager, mockTask, mockWr, [mockTask])).toBe(false);

    // Request from accounting
    expect(canRequestInvoice(userUnassignedManager, mockTask, mockWr, [mockTask])).toBe(false); // Unassigned manager not in WR
    expect(canRequestInvoice(userAccountingTeam, mockTask, mockWr, [mockTask])).toBe(false); // Accounting links directly
    expect(canRequestInvoice(userAdmin, mockTask, mockWr, [mockTask])).toBe(false); // Admin links directly
  });

  it('enforces transmittal permissions (Admin, assigned, Documentation in WR; others request)', () => {
    // Direct link
    expect(canLinkTransmittal(userAdmin, mockTask, mockWr, [mockTask])).toBe(true);
    expect(canLinkTransmittal(userAssignedStaff, mockTask, mockWr, [mockTask])).toBe(true);
    expect(canLinkTransmittal(userDocTeam, mockTask, mockWr, [mockTask])).toBe(true);
    expect(canLinkTransmittal(userUnassignedManager, mockTask, mockWr, [mockTask])).toBe(false);

    // Request from documentation
    expect(canRequestTransmittal(userDocTeam, mockTask, mockWr, [mockTask])).toBe(false); // Doc links directly
    expect(canRequestTransmittal(userAdmin, mockTask, mockWr, [mockTask])).toBe(false); // Admin links directly
  });

  it('enforces disbursement permissions (Admin or assigned employee with permission)', () => {
    expect(canLinkDisbursement(userAdmin, mockTask, true)).toBe(true);
    expect(canLinkDisbursement(userAdmin, mockTask, false)).toBe(true);
    expect(canLinkDisbursement(userAssignedStaff, mockTask, true)).toBe(true);
    expect(canLinkDisbursement(userAssignedStaff, mockTask, false)).toBe(false);
    expect(canLinkDisbursement(userUnassignedManager, mockTask, true)).toBe(false);
  });
});

describe('TaskDetailModal UI Scoping Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBlockingModalStore.getState().reset();
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/time-entries')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/documents')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/operations/tasks/task-scope-1/related')) {
        return new Response(
          JSON.stringify({
            data: { invoices: [], disbursements: [], transmittals: [] },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/me/team')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'emp-assigned-1', name: 'Assigned Lead Staff', role: 'Staff' },
              { id: 'emp-assigned-2', name: 'Assigned Co Staff', role: 'Staff' },
              { id: 'mgr-unassigned', name: 'Unassigned Manager', role: 'Manager', departments: ['Operations'] },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/operations-requests')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
  });

  const createWrapper = () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
  };

  it('renders status, log time, and upload buttons for assigned staff', async () => {
    useSessionStore.getState().setSession({
      user: userAssignedStaff,
      permissions: ['workflow:view', 'timelog:create'],
      activeEntity: 'ATA',
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

    // Status button should be present
    expect(screen.getByTestId('task-toggle-status-btn')).toBeInTheDocument();
    // Log Time button should be present
    expect(screen.getByTestId('open-log-time-btn')).toBeInTheDocument();
    // Upload Document button should be present
    expect(screen.getByTestId('task-upload-doc-btn')).toBeInTheDocument();
  });

  it('HIDES status, log time, and upload buttons for unassigned manager', async () => {
    useSessionStore.getState().setSession({
      user: userUnassignedManager,
      permissions: ['workflow:view', 'workflow:edit'],
      activeEntity: 'ATA',
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

    // Status button MUST be hidden for unassigned manager
    expect(screen.queryByTestId('task-toggle-status-btn')).not.toBeInTheDocument();
    // Log time button MUST be hidden for unassigned manager
    expect(screen.queryByTestId('open-log-time-btn')).not.toBeInTheDocument();
    // Upload doc button MUST be hidden for unassigned manager
    expect(screen.queryByTestId('task-upload-doc-btn')).not.toBeInTheDocument();
  });

  it('renders all action controls for Admin and formats direct approval', async () => {
    useSessionStore.getState().setSession({
      user: userAdmin,
      permissions: ['workflow:view', 'workflow:edit', 'billing:create', 'disbursement:create', 'transmittal:create'],
      activeEntity: 'ATA',
    });

    let patchedData: unknown = null;
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/operations/work-requests/wr-scope-1/tasks/task-scope-1') && init?.method === 'PUT') {
        patchedData = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ data: { ...mockTask, status: 'Completed' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
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

    // Controls present
    expect(screen.getByTestId('task-toggle-status-btn')).toBeInTheDocument();
    expect(screen.getByTestId('open-log-time-btn')).toBeInTheDocument();
    expect(screen.getByTestId('task-upload-doc-btn')).toBeInTheDocument();
    expect(screen.getByTestId('link-invoice-btn')).toBeInTheDocument();
    expect(screen.getByTestId('link-disbursement-btn')).toBeInTheDocument();
    expect(screen.getByTestId('link-transmittal-btn')).toBeInTheDocument();

    // Trigger Admin status change
    fireEvent.click(screen.getByTestId('task-toggle-status-btn'));
    await waitFor(() => {
      expect(patchedData).toEqual({ status: 'Completed' });
    });
  });
});
