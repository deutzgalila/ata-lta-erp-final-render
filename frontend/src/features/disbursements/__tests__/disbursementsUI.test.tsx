import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateDisbursementModal } from '../components/CreateDisbursementModal';
import { AdminApprovalQueue } from '../components/AdminApprovalQueue';
import { FundsReleaseActions } from '../components/FundsReleaseActions';
import { DisbursementsTable } from '../components/DisbursementsTable';
import { DisbursementStatusBadge } from '../components/DisbursementStatusBadge';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import type { Disbursement } from '../api/types';

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

const mockDisbursements: Disbursement[] = [
  {
    id: 'disb-101',
    disbursement_number: 'DISB-ATA-20261004-101',
    entity_id: 'ent-1',
    category: 'Transportation',
    description: 'Messenger delivery to SEC office',
    amount: 350,
    fund_source: 'Firm Fund',
    status: 'Pending',
    linked_work_request_id: '11111111-1111-1111-1111-111111111111',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'disb-102',
    disbursement_number: 'DISB-ATA-20261004-102',
    entity_id: 'ent-1',
    category: 'Government Fee',
    description: 'BIR 0605 renewal fee',
    amount: 500,
    fund_source: 'Client Fund',
    status: 'Approved',
    linked_work_request_id: '11111111-1111-1111-1111-111111111111',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'disb-103',
    disbursement_number: 'DISB-ATA-20261004-103',
    entity_id: 'ent-1',
    category: 'Professional Fee',
    description: 'Notary commission',
    amount: 2500,
    fund_source: 'Firm Fund',
    status: 'Released',
    linked_work_request_id: '11111111-1111-1111-1111-111111111111',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('Disbursements UI Components & Integration', () => {
  const originalFetch = global.fetch;

  const setAdminSession = () => {
    useSessionStore.getState().setSession({
      user: {
        id: 'u-admin-1',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Administration'],
        entities: ['ATA'],
      },
      permissions: [
        'disbursement:view',
        'disbursement:create',
        'disbursement:edit',
        'disbursement:approve',
        'disbursement:mark_released',
      ],
      activeEntity: 'ATA',
    });
  };

  beforeEach(() => {
    setAdminSession();
    useBlockingModalStore.getState().reset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    useBlockingModalStore.getState().reset();
    setAdminSession();
  });

  describe('CreateDisbursementModal & Status Anti-Forgery', () => {
    it('renders form accessible to all authenticated users with NO status input field in DOM', () => {
      const { wrapper } = createHarness();
      render(
        <CreateDisbursementModal isOpen={true} onClose={() => {}} />,
        { wrapper }
      );

      // Verify modal is visible
      expect(screen.getByTestId('create-disbursement-modal')).toBeInTheDocument();
      expect(screen.getByTestId('create-disbursement-form')).toBeInTheDocument();

      // Check required inputs
      expect(screen.getByTestId('input-work-request-id')).toBeInTheDocument();
      expect(screen.getByTestId('select-category')).toBeInTheDocument();
      expect(screen.getByTestId('select-fund-source')).toBeInTheDocument();
      expect(screen.getByTestId('input-amount')).toBeInTheDocument();
      expect(screen.getByTestId('textarea-description')).toBeInTheDocument();

      // STATUS ANTI-FORGERY TEST:
      // Status input MUST NOT exist anywhere in the DOM!
      expect(screen.queryByTestId('select-status')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-status')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
    });

    it('submits valid form and dispatches payload without status property', async () => {
      let dispatchedBody: Record<string, unknown> | null = null;

      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          dispatchedBody = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 201,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: {
                id: 'new-disb-id',
                status: 'Draft',
                ...dispatchedBody,
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [] }),
        };
      });

      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(
        <CreateDisbursementModal
          isOpen={true}
          onClose={onClose}
          defaultWorkRequestId="11111111-1111-1111-1111-111111111111"
        />,
        { wrapper }
      );

      // Fill in amount
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1500.50' } });
      // Fill in description
      fireEvent.change(screen.getByTestId('textarea-description'), {
        target: { value: 'Official court filing fee payment' },
      });

      // Submit
      fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

      await waitFor(() => {
        expect(dispatchedBody).not.toBeNull();
      });

      const body = dispatchedBody!;
      expect(body.amount).toBe(1500.5);
      expect(body.description).toBe('Official court filing fee payment');
      expect(body.linkedWorkRequestId).toBe('11111111-1111-1111-1111-111111111111');
      // Anti-forgery assertion:
      expect(body.status).toBeUndefined();
    });

    it('validates client-side constraints (amount > 0, UUID format)', async () => {
      const { wrapper } = createHarness();

      render(
        <CreateDisbursementModal isOpen={true} onClose={() => {}} />,
        { wrapper }
      );

      // Attempt to submit with invalid amount and invalid UUID
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '-50' } });
      fireEvent.change(screen.getByTestId('input-work-request-id'), { target: { value: 'invalid-uuid' } });
      fireEvent.submit(screen.getByTestId('create-disbursement-form'));

      await waitFor(() => {
        expect(screen.getByTestId('error-amount')).toBeInTheDocument();
        expect(screen.getByTestId('error-work-request-id')).toBeInTheDocument();
      });
    });
  });

  describe('AdminApprovalQueue', () => {
    it('displays clearance required notice for non-Admin user', () => {
      // Set session to staff without disbursement:approve
      useSessionStore.getState().setSession({
        user: {
          id: 'u-staff-1',
          email: 'staff@ata-lta.ph',
          name: 'Staff User',
          role: 'Operations',
          departments: ['Operations'],
          entities: ['ATA'],
        },
        permissions: ['disbursement:view', 'disbursement:create'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      expect(screen.getByTestId('admin-approval-queue-unauthorized')).toBeInTheDocument();
      expect(screen.getByText(/Admin Clearance Required/i)).toBeInTheDocument();
    });

    it('renders pending items for Admin and executes approve workflow', async () => {
      setAdminSession();
      let approvedCall = false;

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/disbursements/disb-101/approve')) {
          approvedCall = true;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ data: { id: 'disb-101', status: 'Approved' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: [mockDisbursements[0]],
            meta: { total: 1, page: 1, limit: 20 },
          }),
        };
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-101')).toBeInTheDocument();
      });

      expect(screen.getByText('Messenger delivery to SEC office')).toBeInTheDocument();

      // Click Approve
      const approveBtn = screen.getByTestId('approve-btn-disb-101');
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(approvedCall).toBe(true);
      });
    });

    it('executes reject workflow opening RejectReasonModal with 1-500 char validation', async () => {
      setAdminSession();
      let rejectedReason: string | null = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/disbursements/disb-101/reject')) {
          const body = JSON.parse(init?.body as string);
          rejectedReason = body.reason;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: { id: 'disb-101', status: 'Rejected', rejection_reason: rejectedReason },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: [mockDisbursements[0]],
            meta: { total: 1, page: 1, limit: 20 },
          }),
        };
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('reject-btn-disb-101')).toBeInTheDocument();
      });

      // Open Reject Modal
      fireEvent.click(screen.getByTestId('reject-btn-disb-101'));

      await waitFor(() => {
        expect(screen.getByTestId('reject-reason-modal')).toBeInTheDocument();
      });

      // 1. Try empty submission -> validation error
      const submitBtn = screen.getByTestId('reject-reason-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('reject-reason-error')).toBeInTheDocument();
      });

      // 2. Type valid reason and submit
      const textarea = screen.getByTestId('reject-reason-textarea');
      fireEvent.change(textarea, { target: { value: 'Ineligible expense without formal receipt' } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(rejectedReason).toBe('Ineligible expense without formal receipt');
      });
    });
  });

  describe('FundsReleaseActions', () => {
    it('renders release action for Approved status and fund action for Released status (gated by disbursement:mark_released)', async () => {
      const { wrapper } = createHarness();

      // Approved item -> Release button visible
      const approvedItem = mockDisbursements[1]!;
      const { unmount } = render(
        <FundsReleaseActions disbursement={approvedItem} />,
        { wrapper }
      );

      expect(screen.getByTestId('release-btn-disb-102')).toBeInTheDocument();
      unmount();

      // Released item -> Mark Funded button visible
      const releasedItem = mockDisbursements[2]!;
      render(
        <FundsReleaseActions disbursement={releasedItem} />,
        { wrapper }
      );

      expect(screen.getByTestId('fund-btn-disb-103')).toBeInTheDocument();
    });

    it('hides release actions when user lacks disbursement:mark_released permission', () => {
      // Set session to staff without mark_released
      useSessionStore.getState().setSession({
        user: {
          id: 'u-ops-1',
          email: 'ops@ata-lta.ph',
          name: 'Operations Staff',
          role: 'Operations',
          departments: ['Operations'],
          entities: ['ATA'],
        },
        permissions: ['disbursement:view'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      const approvedItem = mockDisbursements[1]!;
      const { container } = render(
        <FundsReleaseActions disbursement={approvedItem} />,
        { wrapper }
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('DisbursementsTable & Status Badges', () => {
    it('renders table and status badges correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: mockDisbursements,
          meta: { total: 3, page: 1, limit: 20 },
        }),
      });

      const { wrapper } = createHarness();
      const onSelect = vi.fn();

      render(
        <DisbursementsTable onSelectDisbursement={onSelect} />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('disbursement-row-disb-101')).toBeInTheDocument();
        expect(screen.getByTestId('disbursement-row-disb-102')).toBeInTheDocument();
        expect(screen.getByTestId('disbursement-row-disb-103')).toBeInTheDocument();
      });

      // Check clicking a row
      fireEvent.click(screen.getByTestId('disbursement-row-disb-101'));
      expect(onSelect).toHaveBeenCalledWith('disb-101');
    });

    it('renders DisbursementStatusBadge with proper test attributes', () => {
      const { container } = render(<DisbursementStatusBadge status="Approved" />);
      const badge = container.querySelector('[data-testid="disbursement-status-badge"]');
      expect(badge).toBeInTheDocument();
      expect(badge?.getAttribute('data-test-status')).toBe('approved');
      expect(badge?.textContent).toBe('Approved');
    });
  });
});
