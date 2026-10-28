import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogView } from '../components/AuditLogView';
import {
  formatAuditAction,
  getAuditActionBadgeStyle,
  getAuditItemIdentifier,
  getAuditItemRouteLink,
  parseAuditDiffRows,
  resolveAuditBusinessContext,
} from '../utils/auditFormatters';
import type { AdminUser, AuditLogEntry, AuditLogFilterParams } from '../api/types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const SAMPLE_USERS: AdminUser[] = [
  {
    id: 'usr-admin',
    name: 'Carlos Mendoza',
    email: 'carlos@firm.com',
    role: 'Admin',
    entities: ['ATA', 'LTA'],
    departments: ['Management'],
    isActive: true,
    status: 'Active',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr-mgr',
    name: 'Elena Gomez',
    email: 'elena@firm.com',
    role: 'Manager',
    entities: ['ATA'],
    departments: ['Operations'],
    isActive: true,
    status: 'Active',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const SAMPLE_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-1',
    userId: 'usr-admin',
    action: 'user.updated',
    tableName: 'users',
    recordId: 'usr-mgr',
    entity: 'ATA',
    details: {
      name: 'Elena Gomez',
      email: 'elena@firm.com',
      role: { from: 'Staff', to: 'Manager' },
      entities: ['ATA'],
    },
    createdAt: '2026-03-29T09:30:00Z',
    timestamp: '2026-03-29T09:30:00Z',
  },
  {
    id: 'aud-2',
    userId: 'usr-mgr',
    action: 'invoice.paid',
    tableName: 'invoices',
    recordId: 'inv-1001',
    entity: 'ATA',
    details: {
      invoiceNumber: 'INV-2026-0042',
      clientName: 'Acme Corp',
      amount: 125000,
      status: { old: 'Sent', new: 'Paid' },
    },
    createdAt: '2026-03-29T10:15:00Z',
    timestamp: '2026-03-29T10:15:00Z',
  },
];

const mockUseAuditLogsList = vi.fn();

vi.mock('../api/useUsers', () => ({
  useUsersList: () => ({
    data: SAMPLE_USERS,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../api/useAuditLogs', () => ({
  useAuditLogsList: (filters?: AuditLogFilterParams) => mockUseAuditLogsList(filters),
}));

describe('Admin Audit Log View, Detail Modal & Formatters', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    mockUseAuditLogsList.mockReturnValue({
      data: {
        data: SAMPLE_AUDIT_LOGS,
        meta: { total: 120, page: 1, limit: 50, offset: 0, hasMore: true },
      },
      isLoading: false,
      error: null,
    });
  });

  describe('auditFormatters Utilities', () => {
    it('formats action strings and resolves semantic badge classes', () => {
      expect(formatAuditAction('user.created')).toBe('Created User');
      expect(formatAuditAction('invoice.paid')).toBe('Marked Invoice Paid');
      expect(formatAuditAction('disbursement.released')).toBe('Released Disbursement');
      expect(formatAuditAction('work_request.archived')).toBe('Archived Work Request');

      expect(getAuditActionBadgeStyle('user.created')).toContain('text-[#166534]');
      expect(getAuditActionBadgeStyle('user.disabled')).toContain('text-[#991B1B]');
      expect(getAuditActionBadgeStyle('user.updated')).toContain('text-[#1E40AF]');
      expect(getAuditActionBadgeStyle('invoice.paid')).toContain('text-[#B45309]');
    });

    it('resolves target record identifiers, route links, business context, and visual diff rows', () => {
      const usersMap = new Map(SAMPLE_USERS.map((u) => [u.id, u]));

      expect(getAuditItemIdentifier(SAMPLE_AUDIT_LOGS[0]!, usersMap)).toBe('Elena Gomez');
      expect(getAuditItemIdentifier(SAMPLE_AUDIT_LOGS[1]!, usersMap)).toBe('INV-2026-0042');

      const userLink = getAuditItemRouteLink(SAMPLE_AUDIT_LOGS[0]!);
      expect(userLink).toEqual({
        to: '/admin',
        search: { tab: 'users', userId: 'usr-mgr' },
        label: 'View in User Management',
      });

      const invoiceLink = getAuditItemRouteLink(SAMPLE_AUDIT_LOGS[1]!);
      expect(invoiceLink).toEqual({
        to: '/billing',
        search: { invoiceId: 'inv-1001' },
        label: 'View in Billing',
      });

      expect(
        getAuditItemRouteLink({
          id: 'aud-task',
          action: 'task.updated',
          tableName: 'tasks',
          recordId: 'tsk-42',
          entity: 'ATA',
          userId: 'usr-admin',
          createdAt: '2026-03-29T10:00:00Z',
          details: { workRequestId: 'wr-99', name: 'Draft Contract' },
        })
      ).toEqual({
        to: '/operations',
        search: { tab: 'work-requests', view: 'board', wrId: 'wr-99', taskId: 'tsk-42' },
        label: 'View Task in Operations',
      });

      expect(
        getAuditItemRouteLink({
          id: 'aud-wr-arch',
          action: 'work_request.archived',
          tableName: 'work_requests',
          recordId: 'wr-99',
          entity: 'ATA',
          userId: 'usr-admin',
          createdAt: '2026-03-29T10:00:00Z',
          details: { title: 'Annual Filing' },
        })
      ).toEqual({
        to: '/operations',
        search: { tab: 'archive', wrId: 'wr-99' },
        label: 'View in Operations Archive',
      });

      expect(
        getAuditItemRouteLink({
          id: 'aud-disb',
          action: 'disbursement.released',
          tableName: 'disbursements',
          recordId: 'disb-11',
          entity: 'ATA',
          userId: 'usr-admin',
          createdAt: '2026-03-29T10:00:00Z',
          details: { disbursementNumber: 'DSB-0011' },
        })
      ).toEqual({
        to: '/disbursements',
        search: { disbursementId: 'disb-11' },
        label: 'View in Disbursements',
      });

      expect(
        getAuditItemRouteLink({
          id: 'aud-trk',
          action: 'transmittal.sent',
          tableName: 'transmittals',
          recordId: 'trk-22',
          entity: 'ATA',
          userId: 'usr-admin',
          createdAt: '2026-03-29T10:00:00Z',
          details: { trackingNumber: 'TRK-0022' },
        })
      ).toEqual({
        to: '/transmittals',
        search: { transmittalId: 'trk-22' },
        label: 'View in Transmittals',
      });

      expect(
        getAuditItemRouteLink({
          id: 'aud-doc',
          action: 'document.confirm-upload',
          tableName: 'documents',
          recordId: 'doc-33',
          entity: 'ATA',
          userId: 'usr-admin',
          createdAt: '2026-03-29T10:00:00Z',
          details: { name: 'Permit.pdf' },
        })
      ).toEqual({
        to: '/documents',
        search: { docId: 'doc-33' },
        label: 'View in Documents',
      });

      expect(
        getAuditItemRouteLink({
          id: 'aud-cli',
          action: 'client.updated',
          tableName: 'clients',
          recordId: 'cli-44',
          entity: 'ATA',
          userId: 'usr-admin',
          createdAt: '2026-03-29T10:00:00Z',
          details: { name: 'Acme Corp' },
        })
      ).toEqual({
        to: '/clients',
        search: { clientId: 'cli-44' },
        label: 'View in Clients',
      });

      const context = resolveAuditBusinessContext(SAMPLE_AUDIT_LOGS[1]!, usersMap);
      expect(context).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Invoice No.', value: 'INV-2026-0042' }),
          expect.objectContaining({ label: 'Client', value: 'Acme Corp' }),
          expect.objectContaining({ label: 'Amount', value: '₱125,000.00' }),
        ])
      );

      const diffRows = parseAuditDiffRows(SAMPLE_AUDIT_LOGS[0]!.details, usersMap);
      const roleRow = diffRows.find((r) => r.field === 'role');
      expect(roleRow).toEqual({
        field: 'role',
        label: 'Role',
        before: 'Staff',
        after: 'Manager',
        isDiff: true,
      });
    });
  });

  describe('AuditLogView & AuditLogDetailModal', () => {
    it('renders audit log table, AUR-001 badge, filters, and pagination controls', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AuditLogView />
        </QueryClientProvider>
      );

      expect(screen.getByTestId('audit-log-view')).toBeInTheDocument();
      expect(screen.getByTestId('audit-aur-badge')).toHaveTextContent('AUR-001');
      expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();

      // Rows rendered
      expect(screen.getByTestId('audit-row-aud-1')).toBeInTheDocument();
      expect(screen.getByTestId('audit-row-aud-2')).toBeInTheDocument();
      expect(screen.getByTestId('audit-action-badge-aud-1')).toHaveTextContent(
        'Updated User'
      );
      expect(screen.getByTestId('audit-action-badge-aud-2')).toHaveTextContent(
        'Marked Invoice Paid'
      );
      expect(screen.getByTestId('audit-target-aud-2')).toHaveTextContent(
        'INV-2026-0042'
      );

      // Pagination summary
      expect(screen.getByTestId('audit-pagination-summary')).toHaveTextContent(
        'Showing 1–50 of 120 audit entries'
      );

      // Next page click
      fireEvent.click(screen.getByTestId('audit-next-page'));
      expect(mockUseAuditLogsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 50 })
      );

      // Search input resets page to 1
      fireEvent.change(screen.getByTestId('audit-search-input'), {
        target: { value: 'INV-2026' },
      });
      expect(mockUseAuditLogsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: 'INV-2026' })
      );

      // Date range filter
      fireEvent.change(screen.getByTestId('audit-date-from'), {
        target: { value: '2026-03-01' },
      });
      fireEvent.change(screen.getByTestId('audit-date-to'), {
        target: { value: '2026-03-31' },
      });
      expect(mockUseAuditLogsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-03-01', to: '2026-03-31' })
      );

      // Reset filters
      fireEvent.click(screen.getByTestId('audit-reset-filters'));
      expect(mockUseAuditLogsList).toHaveBeenLastCalledWith({
        page: 1,
        limit: 50,
        sortOrder: 'desc',
      });
    });

    it('opens AuditLogDetailModal with Visual Diff, toggles to Raw JSON, and navigates to target record', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AuditLogView />
        </QueryClientProvider>
      );

      // Deep-link navigation directly from table Target Record cell
      fireEvent.click(screen.getByTestId('audit-target-aud-2'));
      expect(mockNavigate).toHaveBeenCalledWith('/billing?invoiceId=inv-1001');
      mockNavigate.mockClear();

      // Click Details button on aud-1
      fireEvent.click(screen.getByTestId('audit-details-btn-aud-1'));

      expect(screen.getByTestId('audit-detail-modal')).toBeInTheDocument();
      expect(screen.getByTestId('audit-detail-action-badge')).toHaveTextContent(
        'Updated User'
      );
      expect(screen.getByTestId('audit-detail-actor-name')).toHaveTextContent(
        'Carlos Mendoza'
      );

      // Visual Diff view shows Staff -> Manager
      expect(screen.getByTestId('audit-diff-before-role')).toHaveTextContent('Staff');
      expect(screen.getByTestId('audit-diff-after-role')).toHaveTextContent('Manager');

      // Switch to Raw JSON view
      fireEvent.click(screen.getByTestId('audit-view-raw-json'));
      const rawJsonPre = screen.getByTestId('audit-raw-json-pre');
      expect(rawJsonPre).toBeInTheDocument();
      expect(rawJsonPre.textContent).toContain('"from": "Staff"');
      expect(rawJsonPre.textContent).toContain('"to": "Manager"');

      // Deep-link navigation via View Record button
      fireEvent.click(screen.getByTestId('audit-view-record-btn'));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin?tab=users&userId=usr-mgr');
      });
    });
  });
});
