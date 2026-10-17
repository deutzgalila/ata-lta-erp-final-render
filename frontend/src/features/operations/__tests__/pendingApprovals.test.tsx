import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PendingApprovalsInbox } from '../components/PendingApprovalsInbox';
import { RejectReasonModal } from '../components/RejectReasonModal';
import { useBlockingModalStore } from '../components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';

function createHarness() {
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

const mockOperationsRequests = [
  {
    id: 'req-1',
    requestType: 'wr_phase_transition',
    request_type: 'wr_phase_transition',
    workRequestId: 'wr-10',
    work_request_id: 'wr-10',
    fromPhase: 'pre_processing',
    from_phase: 'pre_processing',
    toPhase: 'processing',
    to_phase: 'processing',
    status: 'pending',
    notes: 'All client docs gathered and validated.',
    requestedBy: 'u-mgr-1',
    requested_by: 'u-mgr-1',
    requestedByName: 'Maria Santos',
    requester: { name: 'Maria Santos' },
    work_requests: { title: 'BIR Registration Renewal' },
    workRequestTitle: 'BIR Registration Renewal',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'req-2',
    requestType: 'wr_phase_transition',
    request_type: 'wr_phase_transition',
    workRequestId: 'wr-20',
    work_request_id: 'wr-20',
    fromPhase: 'processing',
    from_phase: 'processing',
    toPhase: 'quality_assurance',
    to_phase: 'quality_assurance',
    status: 'rejected',
    notes: 'Ready for review',
    rejectionReason: 'Missing signed auditor transmittal sheet',
    rejection_reason: 'Missing signed auditor transmittal sheet',
    requestedBy: 'u-mgr-1',
    requested_by: 'u-mgr-1',
    requestedByName: 'Maria Santos',
    requester: { name: 'Maria Santos' },
    work_requests: { title: 'Financial Statement Prep' },
    workRequestTitle: 'Financial Statement Prep',
    fulfilledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

const mockWrDetail = {
  id: 'wr-10',
  title: 'BIR Registration Renewal',
  entity: 'ATA',
  status: 'Pre-processing',
  phase: 'pre_processing',
  priority: 'High',
  version: 1,
  tasks: [
    {
      id: 't-10',
      workRequestId: 'wr-10',
      title: 'Collect BIR 1901',
      status: 'Completed',
      phase: 'pre_processing',
      qaStatus: 'none',
      displayOrder: 1,
    },
    {
      id: 't-11',
      workRequestId: 'wr-10',
      title: 'Submit payment form',
      status: 'In Progress',
      phase: 'pre_processing',
      qaStatus: 'none',
      displayOrder: 2,
    },
  ],
};

describe('Pending Approvals Inbox & Reject Reason Flow', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'u-admin-1',
        email: 'admin@ata-lta.ph',
        name: 'Admin Boss',
        role: 'Admin',
        departments: ['Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'workflow:phase_transition',
        'workflow:transition_request',
      ],
      activeEntity: 'ATA',
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/operations-requests/counts')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { pending: 1, rejected: 1, fulfilled: 0, total: 2 } }),
        } as Response);
      }
      if (u.includes('/operations-requests')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockOperationsRequests }),
        } as Response);
      }
      if (u.includes('/operations/work-requests/wr-10')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockWrDetail }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders PendingApprovalsInbox with queue items, badges, and phase routes', async () => {
    const { wrapper } = createHarness();
    render(<PendingApprovalsInbox />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('pending-approvals-inbox')).toBeInTheDocument();
      expect(screen.getAllByText('BIR Registration Renewal').length).toBeGreaterThan(0);
    });

    expect(screen.getByTestId('pending-badge-count')).toHaveTextContent('1');
    expect(screen.getByText(/All client docs gathered and validated/i)).toBeInTheDocument();
  });

  it('renders Gate Prerequisite Inspector checklist showing incomplete blockers', async () => {
    const { wrapper } = createHarness();
    render(<PendingApprovalsInbox />, { wrapper });

    await waitFor(
      () => {
        expect(screen.getByTestId('gate-inspector')).toBeInTheDocument();
        expect(screen.getByTestId('gate-status-banner')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    expect(screen.getByText(/1 blocker task\(s\) remaining/i)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('gate-inspector')).getByText('Submit payment form')
    ).toBeInTheDocument();
  });

  it('enforces mandatory rejectionReason in RejectReasonModal', async () => {
    const { wrapper } = createHarness();
    const onClose = vi.fn();

    render(
      <RejectReasonModal
        isOpen={true}
        requestId="req-1"
        workRequestTitle="BIR Registration Renewal"
        onClose={onClose}
      />,
      { wrapper }
    );

    expect(screen.getByTestId('reject-reason-modal')).toBeInTheDocument();

    // Click reject without reason
    const submitBtn = screen.getByTestId('reject-reason-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('reject-reason-error')).toBeInTheDocument();
      expect(screen.getByText(/Rejection reason is required/i)).toBeInTheDocument();
    });

    // Provide valid reason
    const textarea = screen.getByTestId('reject-reason-textarea');
    fireEvent.change(textarea, {
      target: { value: 'Task #2 is still in progress; complete payment before transition.' },
    });

    fireEvent.click(submitBtn);

    // Modal closes or transitions to blocking modal
    await waitFor(() => {
      expect(useBlockingModalStore.getState().title).toBe('Rejecting Phase Transition');
    });
  });
});
