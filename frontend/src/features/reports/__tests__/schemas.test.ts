import { describe, it, expect } from 'vitest';
import {
  analyticsQuerySchema,
  dailyQuerySchema,
  weeklyQuerySchema,
  monthlyPendingQuerySchema,
  agingQuerySchema,
  analyticsDataSchema,
  consolidatedAnalyticsSchema,
  calendarItemSchema,
  dashboardResponseDataSchema,
  dailyReportDataSchema,
  weeklyReportDataSchema,
  monthlyPendingDataSchema,
  agingInvoiceEntrySchema,
  agingBucketDetailSchema,
  agingReportDataSchema,
} from '../api/schemas';

describe('Reports Zod Schemas (reports@2.0.0)', () => {
  describe('Query Parameter Schemas', () => {
    it('validates analyticsQuerySchema with optional startDate and endDate', () => {
      expect(analyticsQuerySchema.safeParse({}).success).toBe(true);
      expect(analyticsQuerySchema.safeParse(undefined).success).toBe(true);
      expect(
        analyticsQuerySchema.safeParse({
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        }).success
      ).toBe(true);
    });

    it('validates dailyQuerySchema enforces YYYY-MM-DD regex', () => {
      expect(dailyQuerySchema.safeParse({ date: '2026-10-04' }).success).toBe(true);
      expect(dailyQuerySchema.safeParse({ date: '2026-1-4' }).success).toBe(false);
      expect(dailyQuerySchema.safeParse({ date: 'invalid-date' }).success).toBe(false);
      expect(dailyQuerySchema.safeParse({}).success).toBe(false);
    });

    it('validates weeklyQuerySchema enforces YYYY-MM-DD regex', () => {
      expect(weeklyQuerySchema.safeParse({ date: '2026-10-04' }).success).toBe(true);
      expect(weeklyQuerySchema.safeParse({ date: '2026/10/04' }).success).toBe(false);
      expect(weeklyQuerySchema.safeParse({}).success).toBe(false);
    });

    it('validates monthlyPendingQuerySchema enforces optional YYYY-MM regex', () => {
      expect(monthlyPendingQuerySchema.safeParse({}).success).toBe(true);
      expect(monthlyPendingQuerySchema.safeParse({ month: '2026-10' }).success).toBe(true);
      expect(monthlyPendingQuerySchema.safeParse({ month: '2026-10-04' }).success).toBe(false);
      expect(monthlyPendingQuerySchema.safeParse({ month: '2026-1' }).success).toBe(false);
    });

    it('validates agingQuerySchema accepts optional valid uuid for clientId', () => {
      expect(agingQuerySchema.safeParse({}).success).toBe(true);
      expect(agingQuerySchema.safeParse(undefined).success).toBe(true);
      expect(
        agingQuerySchema.safeParse({
          clientId: '11111111-1111-1111-1111-111111111111',
        }).success
      ).toBe(true);
      expect(agingQuerySchema.safeParse({ clientId: 'not-a-uuid' }).success).toBe(false);
    });
  });

  describe('analyticsDataSchema', () => {
    const validAnalytics = {
      clients: { total: 42 },
      workRequests: { total: 128 },
      documents: { total: 350 },
      invoices: {
        total: 65,
        totalBilled: 1250000.0,
        totalCollected: 950000.0,
        totalOutstanding: 300000.0,
        byStatus: { Paid: 45, Sent: 20 },
      },
      disbursements: {
        total: 80,
        totalAmount: 420000.0,
        releasedAmount: 380000.0,
        byStatus: { Released: 70, Pending: 10 },
      },
      transmittals: {
        total: 30,
        byStatus: { Delivered: 25, 'In Transit': 5 },
      },
      revenue: {
        totalBilled: 1250000.0,
        totalCollected: 950000.0,
        totalOutstanding: 300000.0,
        totalExpenses: 380000.0,
        netIncome: 570000.0,
      },
    };

    it('validates valid analytics data payload', () => {
      const parsed = analyticsDataSchema.parse(validAnalytics);
      expect(parsed.clients.total).toBe(42);
      expect(parsed.revenue.netIncome).toBe(570000.0);
      expect(parsed.invoices.byStatus['Paid']).toBe(45);
    });

    it('validates consolidatedAnalyticsSchema with ATA and LTA entities', () => {
      const consolidated = {
        analyticsByEntity: {
          ATA: validAnalytics,
          LTA: { ...validAnalytics, clients: { total: 15 } },
        },
      };
      const parsed = consolidatedAnalyticsSchema.parse(consolidated);
      expect(parsed.analyticsByEntity.ATA.clients.total).toBe(42);
      expect(parsed.analyticsByEntity.LTA.clients.total).toBe(15);
    });
  });

  describe('calendarItemSchema & dashboardResponseDataSchema', () => {
    it('validates work request calendar items and disbursement calendar items', () => {
      const wrItem = {
        id: 'wr-1',
        type: 'wr' as const,
        title: 'Corporate Tax Filing',
        status: 'In Progress',
        dueDate: '2026-10-15',
        clientId: 'c-1',
        assigneeId: 'u-1',
        entity: 'ATA' as const,
        tasks: [
          {
            id: 'task-1',
            title: 'Prepare BIR 1702',
            status: 'Pending',
            assigneeId: 'u-1',
            assigneeName: 'Juan Dela Cruz',
            dueDate: '2026-10-10',
          },
        ],
      };
      expect(calendarItemSchema.safeParse(wrItem).success).toBe(true);

      const dbItem = {
        id: 'db-1',
        type: 'db' as const,
        title: 'Filing Fee Disbursement',
        status: 'Approved',
        dueDate: '2026-10-12',
        clientId: 'c-1',
        entity: 'LTA' as const,
        amount: 5000,
      };
      expect(calendarItemSchema.safeParse(dbItem).success).toBe(true);
    });

    it('validates dashboardResponseDataSchema union', () => {
      const dashboardPayload = {
        clients: { total: 10 },
        workRequests: { total: 5 },
        documents: { total: 20 },
        invoices: {
          total: 8,
          totalBilled: 100000,
          totalCollected: 80000,
          totalOutstanding: 20000,
          byStatus: {},
        },
        disbursements: {
          total: 4,
          totalAmount: 15000,
          releasedAmount: 10000,
          byStatus: {},
        },
        transmittals: { total: 2, byStatus: {} },
        revenue: {
          totalBilled: 100000,
          totalCollected: 80000,
          totalOutstanding: 20000,
          totalExpenses: 10000,
          netIncome: 70000,
        },
        calendar: [
          {
            id: 'db-1',
            type: 'db' as const,
            title: 'Court Filing',
            status: 'Approved',
            entity: 'ATA' as const,
            amount: 2500,
          },
        ],
      };
      expect(dashboardResponseDataSchema.safeParse(dashboardPayload).success).toBe(true);
    });
  });

  describe('dailyReportDataSchema & weeklyReportDataSchema', () => {
    it('validates daily activity payload', () => {
      const dailyData = {
        date: '2026-10-04',
        workRequests: [{ id: 'wr-1', title: 'New Request', status: 'Draft' }],
        documents: [{ id: 'doc-1', original_name: 'SEC.pdf', category: 'SEC' }],
        invoices: [{ id: 'inv-1', invoice_number: 'INV-001', total: '15000', status: 'Sent' }],
        payments: [{ id: 'pay-1', amount: 15000, method: 'Bank Transfer' }],
        disbursements: [{ id: 'db-1', disbursement_number: 'DB-001', amount: 2000, status: 'Released' }],
        transmittals: [{ id: 'tr-1', tracking_number: 'TR-001', status: 'Delivered' }],
        summary: {
          workRequests: 1,
          documents: 1,
          invoices: 1,
          invoicesTotal: 15000,
          payments: 1,
          paymentsTotal: 15000,
          disbursements: 1,
          disbursementsTotal: 2000,
          transmittals: 1,
        },
      };
      const parsed = dailyReportDataSchema.parse(dailyData);
      expect(parsed.summary.invoicesTotal).toBe(15000);
      expect(parsed.documents[0]?.original_name).toBe('SEC.pdf');
    });

    it('validates weekly summary payload', () => {
      const weeklyData = {
        weekStart: '2026-09-28',
        weekEnd: '2026-10-04',
        summary: {
          workRequests: 5,
          invoices: 4,
          invoicesTotal: 50000,
          payments: 3,
          paymentsTotal: 40000,
          disbursements: 2,
          disbursementsTotal: 10000,
          documents: 8,
          transmittals: 2,
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
      const parsed = weeklyReportDataSchema.parse(weeklyData);
      expect(parsed.weekStart).toBe('2026-09-28');
      expect(parsed.summary.workRequests).toBe(5);
    });
  });

  describe('monthlyPendingDataSchema & agingReportDataSchema', () => {
    it('validates monthly pending attention items payload', () => {
      const monthlyData = {
        month: '2026-10',
        overdueInvoices: {
          count: 1,
          totalOutstanding: 25000,
          items: [
            {
              id: 'inv-1',
              invoice_number: 'INV-001',
              due_date: '2026-09-30',
              total: 50000,
              balance: 25000,
              status: 'Sent',
              clients: { name: 'Acme Corp' },
            },
          ],
        },
        pendingDisbursements: {
          count: 1,
          totalAmount: 12000,
          items: [
            {
              id: 'db-1',
              disbursement_number: 'DB-001',
              amount: 12000,
              status: 'Pending',
              category: 'Transportation',
            },
          ],
        },
        staleTransmittals: {
          count: 1,
          items: [
            {
              id: 'tr-1',
              tracking_number: 'TR-001',
              created_at: '2026-09-20T00:00:00Z',
              clients: { name: 'Global Tech' },
            },
          ],
        },
      };
      const parsed = monthlyPendingDataSchema.parse(monthlyData);
      expect(parsed.overdueInvoices.count).toBe(1);
      expect(parsed.overdueInvoices.items[0]?.clients?.name).toBe('Acme Corp');
    });

    it('validates AR aging report breakdown schema', () => {
      const invoiceEntry = {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        clientName: 'Pacific Trading',
        clientId: '11111111-1111-1111-1111-111111111111',
        dueDate: '2026-09-15',
        total: 100000,
        balance: 45000,
        daysOverdue: 19,
      };
      expect(agingInvoiceEntrySchema.safeParse(invoiceEntry).success).toBe(true);

      const bucketDetail = {
        total: 45000,
        count: 1,
        invoices: [invoiceEntry],
      };
      expect(agingBucketDetailSchema.safeParse(bucketDetail).success).toBe(true);

      const emptyBucket = { total: 0, count: 0, invoices: [] };
      const agingReport = {
        summary: {
          current: 0,
          '1-30': 45000,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
          grandTotal: 45000,
        },
        buckets: {
          current: emptyBucket,
          '1-30': bucketDetail,
          '31-60': emptyBucket,
          '61-90': emptyBucket,
          '90+': emptyBucket,
        },
      };
      const parsed = agingReportDataSchema.parse(agingReport);
      expect(parsed.summary.grandTotal).toBe(45000);
      expect(parsed.buckets['1-30'].invoices[0]?.clientName).toBe('Pacific Trading');
    });
  });
});
