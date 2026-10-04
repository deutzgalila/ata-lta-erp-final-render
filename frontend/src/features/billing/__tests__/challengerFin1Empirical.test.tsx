import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BillingPage from '@/routes/billing';
import { InvoiceList } from '../components/InvoiceList';
import { InvoiceCreateModal } from '../components/InvoiceCreateModal';
import { getNextInvoiceNumber } from '../utils/formatters';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: ['/billing'] }, children)
    );

  return { queryClient, wrapper };
}

const mockClients = [
  { id: 'c-1', name: 'Client A', entity: 'ATA' as const },
];

const mockWorkRequests = [
  { id: 'wr-1', title: 'Work Request A', entity: 'ATA' as const },
];

const mockInvoices = [
  {
    id: 'inv-1',
    invoice_number: 'ATA-SI-2026-001',
    entity_id: 'ent-ata',
    client_id: 'c-1',
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    status: 'Sent',
    total: 10000,
    balance: 10000,
  },
];

describe('CHALLENGER FIN 1 — Empirical Adversarial Verification Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      const method = opts?.method || 'GET';

      if (u.includes('/clients')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockClients }),
        } as Response);
      }

      if (u.includes('/operations/work-requests')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockWorkRequests }),
        } as Response);
      }

      if (u.includes('/invoices/counts')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { active: 1, archived: 0, overdue: 0 } }),
        } as Response);
      }

      if (u.includes('/invoices') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: mockInvoices,
            meta: { total: 1, page: 1, limit: 25 },
          }),
        } as Response);
      }

      if (u.includes('/invoices') && method === 'POST') {
        const body = JSON.parse(String(opts?.body || '{}'));
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              id: 'inv-new',
              ...body,
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

  // =========================================================================
  // SECTION 1: UAT-FIN1 Adversarial Display Gating & RBAC Enforcement
  // =========================================================================
  describe('UAT-FIN1: Display Gating & RBAC Permissions', () => {
    it('CRITICAL: Operations staff with billing:request (lacking billing:edit) CANNOT see "New Invoice" button in Billing page header', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-ops',
          email: 'mg@ata-lta.ph',
          name: 'MG Atis',
          role: 'Operations',
          departments: ['Operations'],
          entities: ['ATA'],
        },
        permissions: ['billing:view', 'billing:request'], // Notice billing:request is held, but billing:edit is absent
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      render(<BillingPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('billing-page')).toBeInTheDocument();
      });

      // Assert header "New Invoice" button is NOT rendered
      expect(screen.queryByTestId('header-create-invoice-button')).toBeNull();
      expect(screen.queryByText('New Invoice')).toBeNull();
    });

    it('CRITICAL: Operations staff with billing:request (lacking billing:edit) CANNOT see "Create Invoice" button in InvoiceList', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-ops',
          email: 'mg@ata-lta.ph',
          name: 'MG Atis',
          role: 'Operations',
          departments: ['Operations'],
          entities: ['ATA'],
        },
        permissions: ['billing:view', 'billing:request'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      const onCreateSpy = vi.fn();
      render(<InvoiceList onCreateInvoice={onCreateSpy} />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('invoice-list-container')).toBeInTheDocument();
      });

      // Assert table "Create Invoice" button is NOT rendered
      expect(screen.queryByTestId('create-invoice-button')).toBeNull();
      expect(screen.queryByText('Create Invoice')).toBeNull();
      expect(onCreateSpy).not.toHaveBeenCalled();
    });

    it('PROVE: User with billing:view ONLY cannot see or click "New Invoice" or "Create Invoice"', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-doc',
          email: 'doc@ata-lta.ph',
          name: 'Doc Staff',
          role: 'Operations',
          departments: ['Operations'],
          entities: ['ATA'],
        },
        permissions: ['billing:view'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      render(<BillingPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('billing-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('header-create-invoice-button')).toBeNull();
      expect(screen.queryByTestId('create-invoice-button')).toBeNull();
    });

    it('PROVE: User with billing:edit CAN see "New Invoice" in header and "Create Invoice" in list', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-acc',
          email: 'jen@ata-lta.ph',
          name: 'Jen Andonga',
          role: 'Accounting',
          departments: ['Accounting'],
          entities: ['ATA'],
        },
        permissions: ['billing:view', 'billing:edit'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      render(<BillingPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('billing-page')).toBeInTheDocument();
      });

      // Both buttons must be visible
      expect(screen.getByTestId('header-create-invoice-button')).toBeInTheDocument();
      expect(screen.getByTestId('create-invoice-button')).toBeInTheDocument();
    });

    it('PROVE: User with wildcard billing:* CAN see "New Invoice" in header and "Create Invoice" in list', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-admin',
          email: 'lorein@ata-lta.ph',
          name: 'Lorein Wong',
          role: 'Admin',
          departments: ['Management'],
          entities: ['ATA', 'LTA'],
        },
        permissions: ['billing:*'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      render(<BillingPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('billing-page')).toBeInTheDocument();
      });

      expect(screen.getByTestId('header-create-invoice-button')).toBeInTheDocument();
      expect(screen.getByTestId('create-invoice-button')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // SECTION 2: UAT-FIN2 Sequential Numbering Generator & Readonly Constraint
  // =========================================================================
  describe('UAT-FIN2: Sequential Numbering & Readonly Constraint', () => {
    it('generates sequential invoice number starting at 001 for empty list', () => {
      const year = new Date().getFullYear();
      const num = getNextInvoiceNumber('ATA', []);
      expect(num).toBe(`ATA-SI-${year}-001`);
    });

    it('correctly increments existing sequence numbers for the current year and entity', () => {
      const year = new Date().getFullYear();
      const existing = [
        { invoice_number: `ATA-SI-${year}-001` },
        { invoice_number: `ATA-SI-${year}-002` },
        { invoice_number: `ATA-SI-${year}-003` },
      ];
      const nextNum = getNextInvoiceNumber('ATA', existing);
      expect(nextNum).toBe(`ATA-SI-${year}-004`);
    });

    it('handles sequence gaps correctly by choosing max sequence + 1', () => {
      const year = new Date().getFullYear();
      const existing = [
        { invoice_number: `ATA-SI-${year}-001` },
        { invoice_number: `ATA-SI-${year}-008` },
      ];
      const nextNum = getNextInvoiceNumber('ATA', existing);
      expect(nextNum).toBe(`ATA-SI-${year}-009`);
    });

    it('isolates sequence counting per entity (LTA invoices do not increment ATA sequence)', () => {
      const year = new Date().getFullYear();
      const existing = [
        { invoice_number: `LTA-SI-${year}-050` },
        { invoice_number: `LTA-SI-${year}-051` },
      ];
      const nextAta = getNextInvoiceNumber('ATA', existing);
      expect(nextAta).toBe(`ATA-SI-${year}-001`);

      const nextLta = getNextInvoiceNumber('LTA', existing);
      expect(nextLta).toBe(`LTA-SI-${year}-052`);
    });

    it('isolates sequence counting per year (prior year invoices do not increment current year)', () => {
      const year = new Date().getFullYear();
      const existing = [
        { invoice_number: `ATA-SI-${year - 1}-999` },
      ];
      const nextNum = getNextInvoiceNumber('ATA', existing);
      expect(nextNum).toBe(`ATA-SI-${year}-001`);
    });

    it('resolves null, undefined, or ALL entity to ATA default', () => {
      const year = new Date().getFullYear();
      expect(getNextInvoiceNumber(null, [])).toBe(`ATA-SI-${year}-001`);
      expect(getNextInvoiceNumber(undefined, [])).toBe(`ATA-SI-${year}-001`);
      expect(getNextInvoiceNumber('ALL', [])).toBe(`ATA-SI-${year}-001`);
    });

    it('handles camelCase invoiceNumber property gracefully', () => {
      const year = new Date().getFullYear();
      const existing = [
        { invoiceNumber: `ATA-SI-${year}-010` },
      ];
      const nextNum = getNextInvoiceNumber('ATA', existing);
      expect(nextNum).toBe(`ATA-SI-${year}-011`);
    });

    it('CRITICAL: InvoiceCreateModal invoice number input has readOnly attribute and lock styling', async () => {
      useSessionStore.getState().setSession({
        user: {
          id: 'user-acc',
          email: 'jen@ata-lta.ph',
          name: 'Jen Andonga',
          role: 'Accounting',
          departments: ['Accounting'],
          entities: ['ATA'],
        },
        permissions: ['billing:view', 'billing:edit'],
        activeEntity: 'ATA',
      });

      const { wrapper } = createHarness();
      render(<InvoiceCreateModal isOpen={true} onClose={vi.fn()} />, { wrapper });

      const input = screen.getByTestId('input-invoice-number') as HTMLInputElement;
      expect(input).toBeInTheDocument();

      // Readonly DOM attribute checks
      expect(input.hasAttribute('readonly')).toBe(true);
      expect(input.readOnly).toBe(true);

      // Styling checks: bg-slate-50, cursor-not-allowed, font-mono
      expect(input.className).toContain('cursor-not-allowed');
      expect(input.className).toContain('bg-slate-50');
      expect(input.className).toContain('font-mono');

      // Wait for existing invoices query to resolve and update input.value
      const year = new Date().getFullYear();
      await waitFor(() => {
        expect(input.value).toBe(`ATA-SI-${year}-002`);
      });

      // Attempt manual tampering via fireEvent.change
      fireEvent.change(input, { target: { value: 'TAMPERED-INVOICE-001' } });
      // Since input is controlled without onChange, value remains strictly non-tampered
      expect(input.value).toBe(`ATA-SI-${year}-002`);
    });

    it('EMPIRICAL OBSERVATION: Padding format evaluation (3-digit vs 4-digit comparison)', () => {
      // erp_prototype/js/utils.js:264 and formatters.ts:55 both implement padStart(3, '0')
      // yielding 3-digit zero padding (e.g. ATA-SI-2026-001).
      // Note: If 4 digits were expected, padStart(4, '0') would be needed.
      const year = new Date().getFullYear();
      const val = getNextInvoiceNumber('ATA', []);
      expect(val).toBe(`ATA-SI-${year}-001`);
      expect(val).toMatch(new RegExp(`^ATA-SI-${year}-\\d{3,}$`));
    });
  });
});
