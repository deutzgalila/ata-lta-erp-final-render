import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reportsKeys } from '../api/queryKeys';
import {
  useReportsAnalytics,
  useReportsDashboard,
  useDailyReport,
  useWeeklyReport,
  useMonthlyPending,
  useAgingReport,
} from '../api/useReports';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';

vi.mock('@/lib/api', () => ({
  apiRequest: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Reports API & Hook Integration (reports@2.0.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ activeEntity: 'ATA' });
  });

  describe('reportsKeys query key factory', () => {
    it('generates consistent hierarchical query keys', () => {
      expect(reportsKeys.all).toEqual(['reports']);
      expect(reportsKeys.analytics('ATA', { startDate: '2026-01-01' })).toEqual([
        'reports',
        'analytics',
        'ATA',
        { startDate: '2026-01-01' },
      ]);
      expect(reportsKeys.dashboard('ATA')).toEqual(['reports', 'dashboard', 'ATA']);
      expect(reportsKeys.daily('ATA', '2026-10-04')).toEqual([
        'reports',
        'daily',
        'ATA',
        '2026-10-04',
      ]);
      expect(reportsKeys.weekly('ATA', '2026-10-04')).toEqual([
        'reports',
        'weekly',
        'ATA',
        '2026-10-04',
      ]);
      expect(reportsKeys.monthlyPending('ATA', '2026-10')).toEqual([
        'reports',
        'monthlyPending',
        'ATA',
        '2026-10',
      ]);
      expect(reportsKeys.aging('ATA', { clientId: 'c-1' })).toEqual([
        'reports',
        'aging',
        'ATA',
        { clientId: 'c-1' },
      ]);
    });
  });

  describe('useReportsAnalytics hook', () => {
    it('fetches analytics with activeEntity and optional query parameters', async () => {
      const mockData = {
        clients: { total: 10 },
        workRequests: { total: 20 },
        documents: { total: 50 },
        invoices: { total: 5, totalBilled: 50000, totalCollected: 30000, totalOutstanding: 20000, byStatus: {} },
        disbursements: { total: 2, totalAmount: 10000, releasedAmount: 8000, byStatus: {} },
        transmittals: { total: 4, byStatus: {} },
        revenue: { totalBilled: 50000, totalCollected: 30000, totalOutstanding: 20000, totalExpenses: 8000, netIncome: 22000 },
      };
      vi.mocked(apiRequest).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(
        () => useReportsAnalytics({ startDate: '2026-01-01', endDate: '2026-01-31' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(apiRequest).toHaveBeenCalledWith('/reports/analytics?startDate=2026-01-01&endDate=2026-01-31');
      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('useReportsDashboard hook', () => {
    it('fetches dashboard data', async () => {
      const mockData = {
        clients: { total: 5 },
        workRequests: { total: 10 },
        documents: { total: 15 },
        invoices: { total: 3, totalBilled: 10000, totalCollected: 10000, totalOutstanding: 0, byStatus: {} },
        disbursements: { total: 1, totalAmount: 2000, releasedAmount: 2000, byStatus: {} },
        transmittals: { total: 1, byStatus: {} },
        revenue: { totalBilled: 10000, totalCollected: 10000, totalOutstanding: 0, totalExpenses: 2000, netIncome: 8000 },
        calendar: [],
      };
      vi.mocked(apiRequest).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useReportsDashboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiRequest).toHaveBeenCalledWith('/reports/dashboard');
      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('useDailyReport hook', () => {
    it('fetches daily report for given date', async () => {
      const mockData = {
        date: '2026-10-04',
        workRequests: [],
        documents: [],
        invoices: [],
        payments: [],
        disbursements: [],
        transmittals: [],
        summary: {
          workRequests: 0,
          documents: 0,
          invoices: 0,
          invoicesTotal: 0,
          payments: 0,
          paymentsTotal: 0,
          disbursements: 0,
          disbursementsTotal: 0,
          transmittals: 0,
        },
      };
      vi.mocked(apiRequest).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useDailyReport('2026-10-04'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiRequest).toHaveBeenCalledWith('/reports/daily?date=2026-10-04');
      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('useWeeklyReport hook', () => {
    it('fetches weekly report for given date', async () => {
      const mockData = {
        weekStart: '2026-09-28',
        weekEnd: '2026-10-04',
        summary: {
          workRequests: 0,
          invoices: 0,
          invoicesTotal: 0,
          payments: 0,
          paymentsTotal: 0,
          disbursements: 0,
          disbursementsTotal: 0,
          documents: 0,
          transmittals: 0,
        },
        details: {
          workRequests: [],
          invoices: [],
          payments: [],
          disbursements: [],
          documents: [],
          transmittals: [],
        },
      };
      vi.mocked(apiRequest).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useWeeklyReport('2026-10-04'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiRequest).toHaveBeenCalledWith('/reports/weekly?date=2026-10-04');
      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('useMonthlyPending hook', () => {
    it('fetches monthly pending items with month query parameter', async () => {
      const mockData = {
        month: '2026-10',
        overdueInvoices: { count: 0, totalOutstanding: 0, items: [] },
        pendingDisbursements: { count: 0, totalAmount: 0, items: [] },
        staleTransmittals: { count: 0, items: [] },
      };
      vi.mocked(apiRequest).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useMonthlyPending('2026-10'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiRequest).toHaveBeenCalledWith('/reports/monthly-pending?month=2026-10');
      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('useAgingReport hook', () => {
    it('fetches accounts receivable aging report', async () => {
      const mockData = {
        summary: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, grandTotal: 0 },
        buckets: {
          current: { total: 0, count: 0, invoices: [] },
          '1-30': { total: 0, count: 0, invoices: [] },
          '31-60': { total: 0, count: 0, invoices: [] },
          '61-90': { total: 0, count: 0, invoices: [] },
          '90+': { total: 0, count: 0, invoices: [] },
        },
      };
      vi.mocked(apiRequest).mockResolvedValueOnce({ data: mockData });

      const { result } = renderHook(() => useAgingReport(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiRequest).toHaveBeenCalledWith('/reports/aging');
      expect(result.current.data).toEqual(mockData);
    });
  });
});
