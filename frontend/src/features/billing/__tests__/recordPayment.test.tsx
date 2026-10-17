import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
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

const mockInvoiceForPayment: Invoice = {
  id: 'inv-pay-1',
  entity_id: 'ent-ata',
  entity_code: 'ATA',
  invoice_number: 'ATA-SI-2026-0050',
  client_id: 'c-1',
  issue_date: '2026-10-01',
  due_date: '2026-10-31',
  status: 'Sent',
  subtotal: 50000,
  total: 50000,
  amount_paid: 15000,
  balance: 35000,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-05T08:00:00Z',
  clients: {
    name: 'Acme Philippines Corp',
    tin: '123-456-789-000',
    address: '100 Ayala Avenue, Makati',
  },
};

describe('RecordPaymentModal Component', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-acct',
        email: 'accounting@ata-lta.ph',
        name: 'Accounting Staff',
        role: 'Accounting',
        departments: ['Accounting'],
        entities: ['ATA'],
      },
      permissions: ['billing:view', 'billing:payments'],
      activeEntity: 'ATA',
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      const method = opts?.method || 'GET';

      if (u.includes('/invoices/inv-pay-1/payments') && method === 'POST') {
        const body = JSON.parse(String(opts?.body || '{}'));
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              id: 'payment-uuid-1',
              invoice_id: 'inv-pay-1',
              amount: body.amount,
              payment_method: body.method,
              reference_number: body.reference,
              payment_date: body.date,
              notes: body.notes,
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

  it('renders modal with invoice financial figures and remaining balance', async () => {
    const { wrapper } = createHarness();
    render(
      <RecordPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        invoice={mockInvoiceForPayment}
      />,
      { wrapper }
    );

    expect(screen.getByTestId('record-payment-modal')).toBeInTheDocument();
    expect(screen.getByText('Acme Philippines Corp')).toBeInTheDocument();
    expect(screen.getByTestId('remaining-balance-value')).toHaveTextContent('₱35,000.00');
  });

  it('rejects payments greater than remaining balance or non-positive amount', async () => {
    const { wrapper } = createHarness();
    render(
      <RecordPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        invoice={mockInvoiceForPayment}
      />,
      { wrapper }
    );

    const amountInput = screen.getByTestId('payment-amount-input');
    const submitBtn = screen.getByTestId('submit-payment-button');

    // 1. Test amount > remaining balance (35,000)
    fireEvent.change(amountInput, { target: { value: '40000' } });
    fireEvent.click(submitBtn);

    expect(screen.getByTestId('payment-form-error')).toBeInTheDocument();
    expect(screen.getByTestId('payment-form-error')).toHaveTextContent(
      'Payment amount cannot exceed remaining balance'
    );
    expect(global.fetch).not.toHaveBeenCalled();

    // 2. Test amount <= 0
    fireEvent.change(amountInput, { target: { value: '0' } });
    fireEvent.click(submitBtn);

    expect(screen.getByTestId('payment-form-error')).toBeInTheDocument();
    expect(screen.getByTestId('payment-form-error')).toHaveTextContent(
      'Payment amount must be greater than 0'
    );
  });

  it('populates full balance when clicking Pay Full Balance and successfully submits', async () => {
    const onClose = vi.fn();
    const onPaymentRecorded = vi.fn();
    const { wrapper } = createHarness();

    render(
      <RecordPaymentModal
        isOpen={true}
        onClose={onClose}
        invoice={mockInvoiceForPayment}
        onPaymentRecorded={onPaymentRecorded}
      />,
      { wrapper }
    );

    // Click Pay Full Balance
    const payFullBtn = screen.getByTestId('pay-full-balance-button');
    fireEvent.click(payFullBtn);

    const amountInput = screen.getByTestId('payment-amount-input') as HTMLInputElement;
    expect(amountInput.value).toBe('35000');

    // Enter reference
    const refInput = screen.getByTestId('payment-reference-input');
    fireEvent.change(refInput, { target: { value: 'BPI-TRX-12345' } });

    // Submit
    const submitBtn = screen.getByTestId('submit-payment-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/invoices/inv-pay-1/payments'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"amount":35000'),
        })
      );
      expect(onClose).toHaveBeenCalled();
      expect(onPaymentRecorded).toHaveBeenCalled();
    });
  });
});
