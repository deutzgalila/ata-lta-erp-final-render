import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminApprovalModal } from '../components/AdminApprovalModal';
import { EditPaymentDetailsModal } from '../components/EditPaymentDetailsModal';
import { DisbursementDetailDrawer } from '../components/DisbursementDetailDrawer';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
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

const mockPendingDisbursement: Disbursement = {
  id: 'disb-app-1',
  disbursement_number: 'DISB-ATA-20261017-001',
  entity_id: 'ent-ata',
  entity_code: 'ATA',
  category: 'Filing Fee',
  description: 'BIR Annual Registration Document Filing',
  amount: 4500,
  fund_source: 'Firm Fund',
  status: 'Pending',
  linked_work_request_id: 'wr-11111111-1111-1111-1111-111111111111',
  version: 2,
  created_at: '2026-10-17T08:00:00Z',
  updated_at: '2026-10-17T08:00:00Z',
};

const mockReleasedDisbursement: Disbursement = {
  ...mockPendingDisbursement,
  id: 'disb-rel-1',
  status: 'Released',
  version: 3,
  payment_method: 'Bank Transfer',
  payment_reference: 'REF-OLD-999',
  payment_bank: 'BDO',
  payment_date: '2026-10-17',
  receipt_filename: 'official_receipt.pdf',
  receipt_s3_key: 'entities/ATA/disbursements/receipts/opaque-uuid-receipt.pdf',
};

const mockLegacyDisbursement: Disbursement = {
  ...mockPendingDisbursement,
  id: 'disb-leg-1',
  status: 'Released',
  version: 1,
  payment_method: 'Cash',
  payment_date: '2026-09-01',
  receipt_filename: 'legacy_receipt_scan.pdf',
  receipt_s3_key: null, // Legacy record without storage key
};

describe('Direct Admin Approval & Payment Details Corrections (R3 / D2)', () => {
  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Administration'],
        entities: ['ATA'],
      },
      permissions: ['disbursement:view', 'disbursement:approve', 'disbursement:mark_released'],
      activeEntity: 'ATA',
    });
  });

  describe('AdminApprovalModal', () => {
    it('collects payment fields and submits atomic approval with expectedVersion', async () => {
      let approveBody: Record<string, unknown> | null = null;
      let approveUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'POST' && u.includes('/disbursements/disb-app-1/approve')) {
          approveUrl = u;
          approveBody = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: {
                ...mockPendingDisbursement,
                status: 'Released',
                version: 3,
                ...approveBody,
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
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <AdminApprovalModal
          isOpen={true}
          disbursement={mockPendingDisbursement}
          onClose={onClose}
          onSuccess={onSuccess}
        />,
        { wrapper }
      );

      expect(screen.getByTestId('admin-approval-modal')).toBeInTheDocument();
      expect(screen.getByTestId('select-payment-method')).toHaveValue('Bank Transfer');

      // Fill reference and bank
      fireEvent.change(screen.getByTestId('input-payment-reference'), {
        target: { value: 'TXN-987654321' },
      });
      fireEvent.change(screen.getByTestId('input-payment-bank'), {
        target: { value: 'Metrobank Makati' },
      });

      // Submit
      fireEvent.click(screen.getByTestId('btn-confirm-approve'));

      await waitFor(() => {
        expect(approveBody).not.toBeNull();
      });

      expect(approveUrl).toContain('/disbursements/disb-app-1/approve');
      expect(approveBody!.method).toBe('Bank Transfer');
      expect(approveBody!.reference).toBe('TXN-987654321');
      expect(approveBody!.bank).toBe('Metrobank Makati');
      expect(approveBody!.expectedVersion).toBe(2);
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it('validates required payment fields before submission', async () => {
      const { wrapper } = createHarness();
      render(
        <AdminApprovalModal
          isOpen={true}
          disbursement={mockPendingDisbursement}
          onClose={() => {}}
        />,
        { wrapper }
      );

      // Clear method
      fireEvent.change(screen.getByTestId('select-payment-method'), {
        target: { value: '' },
      });

      fireEvent.click(screen.getByTestId('btn-confirm-approve'));

      await waitFor(() => {
        expect(screen.getByText('Payment method is required')).toBeInTheDocument();
      });
    });
  });

  describe('EditPaymentDetailsModal', () => {
    it('corrects payment details on Released/Funded vouchers targeting PATCH /payment-details', async () => {
      let patchedBody: Record<string, unknown> | null = null;
      let patchedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'PATCH' && u.includes('/disbursements/disb-rel-1/payment-details')) {
          patchedUrl = u;
          patchedBody = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: {
                ...mockReleasedDisbursement,
                version: 4,
                ...patchedBody,
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
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <EditPaymentDetailsModal
          isOpen={true}
          disbursement={mockReleasedDisbursement}
          onClose={onClose}
          onSuccess={onSuccess}
        />,
        { wrapper }
      );

      expect(screen.getByTestId('edit-payment-details-modal')).toBeInTheDocument();
      expect(screen.getByTestId('input-edit-payment-reference')).toHaveValue('REF-OLD-999');

      // Change payment method, reference, and bank
      fireEvent.change(screen.getByTestId('select-edit-payment-method'), {
        target: { value: 'Check' },
      });
      fireEvent.change(screen.getByTestId('input-edit-payment-reference'), {
        target: { value: 'CHK-CORRECTED-1002' },
      });
      fireEvent.change(screen.getByTestId('input-edit-payment-bank'), {
        target: { value: 'BPI Ayala' },
      });

      fireEvent.click(screen.getByTestId('btn-save-payment-details'));

      await waitFor(() => {
        expect(patchedBody).not.toBeNull();
      });

      expect(patchedUrl).toContain('/disbursements/disb-rel-1/payment-details');
      expect(patchedBody!.method).toBe('Check');
      expect(patchedBody!.reference).toBe('CHK-CORRECTED-1002');
      expect(patchedBody!.bank).toBe('BPI Ayala');
      expect(patchedBody!.expectedVersion).toBe(3);
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  describe('Authorized Receipt Preview & Legacy Unavailable Notice (R5 / D4)', () => {
    it('renders preview button and opens authorized receipt URL for valid S3 key', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes('/disbursements/disb-rel-1/receipt-url')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: {
                url: 'https://storage.test/signed/official_receipt.pdf',
                filename: 'official_receipt.pdf',
                contentType: 'application/pdf',
                expiresAt: '2026-10-18T01:00:00Z',
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
      render(
        <DisbursementDetailDrawer
          isOpen={true}
          onClose={() => {}}
          initialDisbursement={mockReleasedDisbursement}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-preview-receipt')).toBeInTheDocument();
      });

      expect(screen.getByTestId('btn-preview-receipt')).toHaveAttribute(
        'href',
        'https://storage.test/signed/official_receipt.pdf'
      );
    });

    it('renders explicit legacy attachment unavailable notice when receipt_s3_key is null', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes('/disbursements/disb-leg-1/receipt-url')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              data: {
                status: 'unavailable',
                filename: 'legacy_receipt_scan.pdf',
                reason: 'legacy_attachment_missing',
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
      render(
        <DisbursementDetailDrawer
          isOpen={true}
          onClose={() => {}}
          initialDisbursement={mockLegacyDisbursement}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('receipt-legacy-unavailable')).toBeInTheDocument();
      });

      expect(screen.getByTestId('receipt-legacy-unavailable')).toHaveTextContent(
        /Supporting document unavailable \(legacy record\)/i
      );
    });
  });
});
