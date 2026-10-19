import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminApprovalQueue } from '../components/AdminApprovalQueue';
import { useSessionStore } from '@/lib/session';
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

describe('AdminApprovalQueue Governance & Reliability (F13 & F14 / R7 / V10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
      permissions: ['disbursement:view', 'disbursement:approve'],
      activeEntity: 'ATA',
    });
  };

  const setStaffSession = (userId = 'u-staff-1') => {
    useSessionStore.getState().setSession({
      user: {
        id: userId,
        email: 'staff@ata-lta.ph',
        name: 'Staff User',
        role: 'Operations',
        departments: ['Operations'],
        entities: ['ATA'],
      },
      permissions: ['disbursement:view', 'disbursement:create'],
      activeEntity: 'ATA',
    });
  };

  describe('Requirement 1: Inclusion of Submitted status', () => {
    it('queries Submitted, Pending, and Pending Admin Approval with limit 100 and displays all', async () => {
      setAdminSession();
      const queriedStatuses: string[] = [];

      const mockSubmitted: Disbursement = {
        id: 'disb-sub-1',
        disbursement_number: 'DISB-ATA-SUB-001',
        entity_id: 'ent-1',
        category: 'Transportation',
        description: 'Submitted courier expense',
        amount: 250,
        fund_source: 'Firm Fund',
        status: 'Submitted',
        linked_work_request_id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        created_at: '2026-10-18T10:00:00Z',
        updated_at: '2026-10-18T10:00:00Z',
      };

      const mockPending: Disbursement = {
        id: 'disb-pen-1',
        disbursement_number: 'DISB-ATA-PEN-001',
        entity_id: 'ent-1',
        category: 'Supplies',
        description: 'Pending office supplies',
        amount: 1500,
        fund_source: 'Firm Fund',
        status: 'Pending',
        linked_work_request_id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        created_at: '2026-10-18T09:00:00Z',
        updated_at: '2026-10-18T09:00:00Z',
      };

      const mockPendingAdmin: Disbursement = {
        id: 'disb-pad-1',
        disbursement_number: 'DISB-ATA-PAD-001',
        entity_id: 'ent-1',
        category: 'Government Fee',
        description: 'Pending Admin SEC filing',
        amount: 3000,
        fund_source: 'Client Fund',
        status: 'Pending Admin Approval',
        linked_work_request_id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        created_at: '2026-10-18T08:00:00Z',
        updated_at: '2026-10-18T08:00:00Z',
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const u = new URL(url, 'http://localhost');
        const status = u.searchParams.get('status');
        if (status) queriedStatuses.push(status);

        if (status === 'Submitted') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ data: [mockSubmitted], meta: { total: 1 } }),
          };
        }
        if (status === 'Pending') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ data: [mockPending], meta: { total: 1 } }),
          };
        }
        if (status === 'Pending Admin Approval') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ data: [mockPendingAdmin], meta: { total: 1 } }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [], meta: { total: 0 } }),
        };
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-sub-1')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-pen-1')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-pad-1')).toBeInTheDocument();
      });

      expect(queriedStatuses).toContain('Submitted');
      expect(queriedStatuses).toContain('Pending');
      expect(queriedStatuses).toContain('Pending Admin Approval');
    });
  });

  describe('Requirement 2: Staff filtering by requested_by / created_by', () => {
    it('filters staff view by requested_by or created_by and strictly ignores employee_id', async () => {
      const staffId = 'u-staff-42';
      setStaffSession(staffId);

      const items: Disbursement[] = [
        {
          id: 'disb-created',
          disbursement_number: 'DISB-CREATOR',
          entity_id: 'ent-1',
          category: 'Meals',
          description: 'Client luncheon created by staff',
          amount: 800,
          fund_source: 'Firm Fund',
          status: 'Submitted',
          created_by: staffId,
          requested_by: 'someone-else',
          employee_id: 'another-person',
          linked_work_request_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          created_at: '2026-10-18T10:00:00Z',
          updated_at: '2026-10-18T10:00:00Z',
        },
        {
          id: 'disb-requested-snake',
          disbursement_number: 'DISB-REQ-SNAKE',
          entity_id: 'ent-1',
          category: 'Transportation',
          description: 'Grab taxi requested by staff (snake_case)',
          amount: 450,
          fund_source: 'Firm Fund',
          status: 'Pending',
          created_by: 'finance-admin',
          requested_by: staffId,
          employee_id: 'another-person',
          linked_work_request_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          created_at: '2026-10-18T09:00:00Z',
          updated_at: '2026-10-18T09:00:00Z',
        },
        {
          id: 'disb-requested-camel',
          disbursement_number: 'DISB-REQ-CAMEL',
          entity_id: 'ent-1',
          category: 'Supplies',
          description: 'Archival binders requested by staff (camelCase)',
          amount: 320,
          fund_source: 'Firm Fund',
          status: 'Pending Admin Approval',
          createdBy: 'finance-admin',
          requestedBy: staffId,
          employeeId: 'another-person',
          linked_work_request_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          created_at: '2026-10-18T08:30:00Z',
          updated_at: '2026-10-18T08:30:00Z',
        },
        {
          id: 'disb-employee-only',
          disbursement_number: 'DISB-EMP-ONLY',
          entity_id: 'ent-1',
          category: 'Notarial',
          description: 'Notary fee where staff is only employee_id not requester/creator',
          amount: 500,
          fund_source: 'Firm Fund',
          status: 'Pending',
          created_by: 'other-user',
          requested_by: 'other-user',
          employee_id: staffId, // Should NOT cause inclusion!
          linked_work_request_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          created_at: '2026-10-18T08:00:00Z',
          updated_at: '2026-10-18T08:00:00Z',
        },
        {
          id: 'disb-unrelated',
          disbursement_number: 'DISB-UNRELATED',
          entity_id: 'ent-1',
          category: 'Miscellaneous',
          description: 'Completely unrelated voucher',
          amount: 1000,
          fund_source: 'Firm Fund',
          status: 'Submitted',
          created_by: 'other-user',
          requested_by: 'other-user',
          employee_id: 'other-user',
          linked_work_request_id: '11111111-1111-1111-1111-111111111111',
          version: 1,
          created_at: '2026-10-18T07:00:00Z',
          updated_at: '2026-10-18T07:00:00Z',
        },
      ];

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: items, meta: { total: items.length } }),
        };
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-created')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-requested-snake')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-requested-camel')).toBeInTheDocument();
      });

      // Employee-only and unrelated items MUST be excluded
      expect(screen.queryByTestId('pending-item-disb-employee-only')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pending-item-disb-unrelated')).not.toBeInTheDocument();
    });
  });

  describe('Requirement 3: Queue pagination', () => {
    it('paginates 15 items with pageSize=10, controls navigation and resets on search', async () => {
      setAdminSession();

      const fifteenItems: Disbursement[] = Array.from({ length: 15 }, (_, i) => ({
        id: `disb-page-${i + 1}`,
        disbursement_number: `DISB-PAGE-${String(i + 1).padStart(3, '0')}`,
        entity_id: 'ent-1',
        category: 'Transportation',
        description: `Expense item number ${i + 1}`,
        amount: 100 * (i + 1),
        fund_source: 'Firm Fund',
        status: 'Pending',
        linked_work_request_id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
        updated_at: new Date(Date.now() - i * 60000).toISOString(),
      }));

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: fifteenItems, meta: { total: 15 } }),
        };
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      // Page 1: Items 1 to 10 visible, 11 to 15 not visible
      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-page-1')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-page-10')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('pending-item-disb-page-11')).not.toBeInTheDocument();

      // Verify page info & indicator
      expect(screen.getByTestId('queue-page-info')).toHaveTextContent('Showing 1–10 of 15');
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

      // Prev disabled on page 1, Next enabled
      const prevBtn = screen.getByTestId('queue-prev-page');
      const nextBtn = screen.getByTestId('queue-next-page');
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      // Navigate to Page 2
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-page-11')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-page-15')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('pending-item-disb-page-1')).not.toBeInTheDocument();

      // Verify page info on page 2
      expect(screen.getByTestId('queue-page-info')).toHaveTextContent('Showing 11–15 of 15');
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      expect(prevBtn).not.toBeDisabled();
      expect(nextBtn).toBeDisabled();

      // Navigate back to Page 1
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-page-1')).toBeInTheDocument();
      });
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

      // Typing in search input resets page to 1
      fireEvent.click(nextBtn);
      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('pending-queue-search-input');
      fireEvent.change(searchInput, { target: { value: 'item number' } });

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 4 (F4): Complete page traversal beyond 100 items per status', () => {
    it('fetches all pages for status with >100 records and enables search and access for the 101st record', async () => {
      setAdminSession();

      const totalItems = 105;
      const allItems: Disbursement[] = Array.from({ length: totalItems }, (_, i) => ({
        id: `disb-huge-${i + 1}`,
        disbursement_number: `DISB-HUGE-${String(i + 1).padStart(3, '0')}`,
        entity_id: 'ent-1',
        category: 'Legal Fee',
        description: `High-volume item ${i + 1}`,
        amount: 200,
        fund_source: 'Firm Fund',
        status: 'Submitted',
        linked_work_request_id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
        updated_at: new Date(Date.now() - i * 1000).toISOString(),
      }));

      const queriedUrls: string[] = [];

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        queriedUrls.push(url);
        const u = new URL(url, 'http://localhost');
        const status = u.searchParams.get('status');
        const page = parseInt(u.searchParams.get('page') || '1', 10);
        const limit = parseInt(u.searchParams.get('limit') || '100', 10);

        if (status === 'Submitted') {
          const start = (page - 1) * limit;
          const pageData = allItems.slice(start, start + limit);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: pageData,
              meta: { total: totalItems, page, limit },
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [], meta: { total: 0 } }),
        };
      });

      const { wrapper } = createHarness();
      render(<AdminApprovalQueue />, { wrapper });

      // Page 1 displays items 1 to 10
      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-huge-1')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-huge-10')).toBeInTheDocument();
      });

      // Total pages should be ceil(105 / 10) = 11
      expect(screen.getByText('Page 1 of 11')).toBeInTheDocument();
      expect(screen.getByTestId('queue-page-info')).toHaveTextContent('Showing 1–10 of 105');

      // Verify page traversal occurred during fetch
      const submittedUrls = queriedUrls.filter((u) => u.includes('status=Submitted'));
      expect(submittedUrls.some((u) => u.includes('page=1'))).toBe(true);
      expect(submittedUrls.some((u) => u.includes('page=2'))).toBe(true);

      // Search for item 101 which was returned on server page 2
      const searchInput = screen.getByTestId('pending-queue-search-input');
      fireEvent.change(searchInput, { target: { value: 'item 101' } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-item-disb-huge-101')).toBeInTheDocument();
      });

      // Clear search and navigate directly to page 11 to verify items 101–105
      fireEvent.change(searchInput, { target: { value: '' } });
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 11')).toBeInTheDocument();
      });

      const nextBtn = screen.getByTestId('queue-next-page');
      for (let p = 1; p < 11; p++) {
        fireEvent.click(nextBtn);
      }

      await waitFor(() => {
        expect(screen.getByText('Page 11 of 11')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-huge-101')).toBeInTheDocument();
        expect(screen.getByTestId('pending-item-disb-huge-105')).toBeInTheDocument();
      });
      expect(screen.getByTestId('queue-page-info')).toHaveTextContent('Showing 101–105 of 105');
    });
  });
});
