import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceDetailModal } from '../components/InvoiceDetailModal';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';
import type { Invoice } from '../api/types';

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

const mockDetailInvoice: Invoice = {
  id: 'inv-detail-1',
  entity_id: 'ent-ata',
  entity_code: 'ATA',
  invoice_number: 'ATA-SI-2026-0099',
  client_id: 'c-1',
  issue_date: '2026-10-10',
  due_date: '2026-11-10',
  status: 'Draft',
  subtotal: 50000,
  total: 50000,
  amount_paid: 20000,
  balance: 30000,
  address: '100 Ayala Avenue, Makati',
  notes: 'Quarterly compliance notes',
  terms: 'Net 30 days',
  version: 1,
  created_at: '2026-10-10T08:00:00Z',
  updated_at: '2026-10-10T08:00:00Z',
  clients: {
    name: 'Acme Philippines Corp',
    tin: '123-456-789-000',
    address: '100 Ayala Avenue, Makati',
  },
  line_items: [
    {
      id: 'li-1',
      description: 'Tax Planning & Compliance',
      amount: 30000,
      type: 'Professional Fee',
    },
    {
      id: 'li-2',
      description: 'SEC Statutory Filing Fees',
      amount: 20000,
      type: 'Government Fee',
    },
  ],
  payments: [
    {
      id: 'pay-1',
      invoice_id: 'inv-detail-1',
      amount: 20000,
      payment_method: 'Check',
      reference_number: 'CHK-998877',
      payment_date: '2026-10-12',
      notes: 'Initial deposit check',
    },
  ],
};

describe('InvoiceDetailModal Component', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Accounting'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'billing:view',
        'billing:edit',
        'billing:payments',
        'billing:edit_client_address',
        'billing:delete',
      ],
      activeEntity: 'ATA',
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      const method = opts?.method || 'GET';

      if (u.includes('/invoices/inv-detail-1') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockDetailInvoice }),
        } as Response);
      }

      if (u.includes('/invoices/inv-detail-1') && method === 'PATCH') {
        const body = JSON.parse(String(opts?.body || '{}'));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              ...mockDetailInvoice,
              ...body,
              version: (mockDetailInvoice.version || 1) + 1,
            },
          }),
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
    vi.clearAllMocks();
  });

  it('renders invoice details, client snapshot, line items breakdown, and payments', async () => {
    const { wrapper } = createHarness();
    render(
      <InvoiceDetailModal
        isOpen={true}
        onClose={vi.fn()}
        invoiceId="inv-detail-1"
        initialInvoice={mockDetailInvoice}
      />,
      { wrapper }
    );

    expect(screen.getByTestId('invoice-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('ATA-SI-2026-0099')).toBeInTheDocument();
    expect(screen.getByTestId('detail-status-badge')).toHaveTextContent('Draft');

    // Client Snapshot
    expect(screen.getByText('Acme Philippines Corp')).toBeInTheDocument();
    expect(screen.getByText('TIN: 123-456-789-000')).toBeInTheDocument();
    expect(screen.getByTestId('detail-client-address')).toHaveTextContent(
      '100 Ayala Avenue, Makati'
    );

    // Line items
    expect(screen.getByText('Tax Planning & Compliance')).toBeInTheDocument();
    expect(screen.getByText('SEC Statutory Filing Fees')).toBeInTheDocument();

    // Financial totals
    expect(screen.getByTestId('detail-total-amount')).toHaveTextContent('₱50,000.00');
    expect(screen.getByTestId('detail-amount-paid')).toHaveTextContent('₱20,000.00');
    expect(screen.getByTestId('detail-balance-amount')).toHaveTextContent('₱30,000.00');

    // Payment history
    expect(screen.getByText('Check')).toBeInTheDocument();
    expect(screen.getByText('CHK-998877')).toBeInTheDocument();
    expect(screen.getByText('Initial deposit check')).toBeInTheDocument();
  });

  it('transitions status from Draft to Submit for Approval (Pending)', async () => {
    const { wrapper } = createHarness();
    render(
      <InvoiceDetailModal
        isOpen={true}
        onClose={vi.fn()}
        invoiceId="inv-detail-1"
        initialInvoice={mockDetailInvoice}
      />,
      { wrapper }
    );

    const submitBtn = screen.getByTestId('btn-submit-for-approval');
    expect(submitBtn).toBeInTheDocument();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/invoices/inv-detail-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"Pending"'),
        })
      );
    });
  });

  it('triggers onOpenPrintPreview and onOpenRecordPayment callbacks', async () => {
    const onOpenPrintPreview = vi.fn();
    const onOpenRecordPayment = vi.fn();

    const releasedInvoice: Invoice = {
      ...mockDetailInvoice,
      status: 'Sent',
    };

    const { wrapper } = createHarness();
    render(
      <InvoiceDetailModal
        isOpen={true}
        onClose={vi.fn()}
        invoiceId="inv-detail-1"
        initialInvoice={releasedInvoice}
        onOpenPrintPreview={onOpenPrintPreview}
        onOpenRecordPayment={onOpenRecordPayment}
      />,
      { wrapper }
    );

    // Print Preview button
    const printBtn = screen.getByTestId('detail-btn-print-preview');
    fireEvent.click(printBtn);
    expect(onOpenPrintPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-detail-1' })
    );

    // Record Payment button (visible when released and balance > 0)
    const payBtn = screen.getByTestId('detail-btn-record-payment');
    fireEvent.click(payBtn);
    expect(onOpenRecordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-detail-1' })
    );
  });
});
