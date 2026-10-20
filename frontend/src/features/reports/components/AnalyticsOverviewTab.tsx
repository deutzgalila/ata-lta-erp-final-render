import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useReportsAnalytics } from '../api/useReports';
import type { AnalyticsData, ConsolidatedAnalyticsData } from '../api/types';
import { formatCurrency, formatCount } from '../utils/formatters';
import { useSessionStore } from '@/lib/session';
import {
  ReportToolbar,
  ReportToolbarGroup,
  ReportSummaryBand,
  ReportSection,
  ReportTableContainer,
  ReportLoadingState,
  ReportErrorState,
  ReportEmptyState,
} from './';

// ============================================================================
// Helpers
// ============================================================================

function getUniqueKeys(
  objA?: Record<string, number>,
  objB?: Record<string, number>
): string[] {
  const keys = new Set<string>();
  if (objA) Object.keys(objA).forEach((k) => keys.add(k));
  if (objB) Object.keys(objB).forEach((k) => keys.add(k));
  return Array.from(keys).sort();
}

interface StatusProgressBarProps {
  label: string;
  count: number;
  total: number;
  maxCount: number;
}

function StatusProgressBar({ label, count, total, maxCount }: StatusProgressBarProps) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  const barWidth =
    maxCount > 0 ? Math.max(6, Math.min(100, Math.round((count / maxCount) * 100))) : 0;

  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="font-medium text-[#0A0A0A]">{label}</span>
        <div className="flex items-center gap-1.5 tabular-nums">
          <span className="font-bold text-[#0A0A0A]">{formatCount(count)}</span>
          <span className="text-[#4A4945] font-normal">({percentage}%)</span>
        </div>
      </div>
      <div className="w-full bg-[#EAE8E3] border border-[#0A0A0A]/40 rounded-none h-2.5 overflow-hidden">
        <div
          className="bg-[#0A0A0A] h-full rounded-none transition-all duration-150"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function StatusBreakdownList({
  title,
  total,
  byStatus,
}: {
  title: string;
  total: number;
  byStatus?: Record<string, number>;
}) {
  const entries = Object.entries(byStatus || {});
  if (entries.length === 0) {
    return (
      <div className="mt-4 pt-3 border-t border-[#C8C5BC] font-mono text-xs text-[#4A4945] italic">
        No status data recorded
      </div>
    );
  }

  const maxCount = Math.max(1, ...entries.map(([, c]) => c));

  return (
    <div className="mt-4 pt-3 border-t border-[#C8C5BC]">
      <h4 className="font-mono text-xs font-semibold text-[#0A0A0A] mb-2 uppercase tracking-wider">
        {title}
      </h4>
      <div className="space-y-2">
        {entries.map(([status, count]) => (
          <StatusProgressBar
            key={status}
            label={status}
            count={count}
            total={total}
            maxCount={maxCount}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Single Entity View (ATA or LTA)
// ============================================================================

function SingleAnalyticsView({ data }: { data: AnalyticsData }) {
  const { clients, workRequests, documents, invoices, disbursements, transmittals, revenue } =
    data;

  const summaryMetrics = [
    {
      label: 'Total billed',
      value: formatCurrency(revenue?.totalBilled),
      dataTestId: 'summary-billed',
    },
    {
      label: 'Total collected',
      value: formatCurrency(revenue?.totalCollected),
      dataTestId: 'summary-collected',
    },
    {
      label: 'Total outstanding',
      value: formatCurrency(revenue?.totalOutstanding),
      attention: (revenue?.totalOutstanding ?? 0) > 0,
      dataTestId: 'summary-outstanding',
    },
    {
      label: 'Net income',
      value: formatCurrency(revenue?.netIncome),
      dataTestId: 'summary-net-income',
    },
  ];

  const recordKpis = [
    {
      label: 'Clients',
      value: formatCount(clients?.total),
      testId: 'kpi-clients',
    },
    {
      label: 'Work requests',
      value: formatCount(workRequests?.total),
      testId: 'kpi-work-requests',
    },
    {
      label: 'Active documents',
      value: formatCount(documents?.total),
      testId: 'kpi-documents',
    },
    {
      label: 'Invoices',
      value: formatCount(invoices?.total),
      testId: 'kpi-invoices',
    },
    {
      label: 'Disbursements',
      value: formatCount(disbursements?.total),
      testId: 'kpi-disbursements',
    },
    {
      label: 'Transmittals',
      value: formatCount(transmittals?.total),
      testId: 'kpi-transmittals',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Neutral Financial Summary Band */}
      <ReportSection
        title="Revenue & P&L Summary"
        dataTestId="section-revenue"
      >
        <div className="space-y-3">
          <ReportSummaryBand metrics={summaryMetrics} columns={4} />

          {/* Supporting Expenses row beneath summary band */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none text-xs sm:text-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
              Supporting expenses (disbursements)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#4A4945]">Total expenses:</span>
              <span className="font-mono font-bold text-sm sm:text-base text-[#0A0A0A] tabular-nums">
                {formatCurrency(revenue?.totalExpenses)}
              </span>
            </div>
          </div>
        </div>
      </ReportSection>

      {/* 2. Compact Record Totals Matrix */}
      <ReportSection
        title="Record totals"
        dataTestId="section-record-totals"
      >
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[#0A0A0A] border border-[#0A0A0A] rounded-none"
          data-testid="analytics-kpi-grid"
        >
          {recordKpis.map((kpi) => (
            <div
              key={kpi.label}
              data-testid={kpi.testId}
              className="p-3.5 sm:p-4 bg-[#FAF9F5] rounded-none"
            >
              <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
                {kpi.label}
              </div>
              <div className="font-mono text-lg sm:text-xl font-bold text-[#0A0A0A] tracking-tight tabular-nums mt-1">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      </ReportSection>

      {/* 3. Status Breakdowns Bento Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        data-testid="analytics-bento-grid"
      >
        {/* Billing Summary */}
        <div className="bg-[#FAF9F5] p-4 sm:p-5 rounded-none border border-[#0A0A0A] shadow-none flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#0A0A0A]">
              <h3 className="text-sm font-bold uppercase tracking-tight text-[#0A0A0A]">
                Billing Summary
              </h3>
              <span className="rounded-none border border-[#0A0A0A] bg-[#EAE8E3] px-2 py-0.5 font-mono text-xs font-semibold text-[#0A0A0A] tabular-nums">
                {formatCount(invoices?.total)} invoices
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#C8C5BC]">
                <span className="font-mono text-[#4A4945]">Total billed</span>
                <span className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                  {formatCurrency(invoices?.totalBilled)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#C8C5BC]">
                <span className="font-mono text-[#4A4945]">Total collected</span>
                <span className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                  {formatCurrency(invoices?.totalCollected)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-mono text-[#4A4945]">Total outstanding</span>
                <span className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                  {formatCurrency(invoices?.totalOutstanding)}
                </span>
              </div>
            </div>
          </div>

          <StatusBreakdownList
            title="Invoices by status"
            total={invoices?.total ?? 0}
            byStatus={invoices?.byStatus}
          />
        </div>

        {/* Disbursement Summary */}
        <div className="bg-[#FAF9F5] p-4 sm:p-5 rounded-none border border-[#0A0A0A] shadow-none flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#0A0A0A]">
              <h3 className="text-sm font-bold uppercase tracking-tight text-[#0A0A0A]">
                Disbursement Summary
              </h3>
              <span className="rounded-none border border-[#0A0A0A] bg-[#EAE8E3] px-2 py-0.5 font-mono text-xs font-semibold text-[#0A0A0A] tabular-nums">
                {formatCount(disbursements?.total)} vouchers
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#C8C5BC]">
                <span className="font-mono text-[#4A4945]">Total recorded</span>
                <span className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                  {formatCurrency(disbursements?.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-mono text-[#4A4945]">Released amount</span>
                <span className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                  {formatCurrency(disbursements?.releasedAmount)}
                </span>
              </div>
            </div>
          </div>

          <StatusBreakdownList
            title="Disbursements by status"
            total={disbursements?.total ?? 0}
            byStatus={disbursements?.byStatus}
          />
        </div>

        {/* Transmittal Summary */}
        <div className="bg-[#FAF9F5] p-4 sm:p-5 rounded-none border border-[#0A0A0A] shadow-none flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#0A0A0A]">
              <h3 className="text-sm font-bold uppercase tracking-tight text-[#0A0A0A]">
                Transmittal Summary
              </h3>
              <span className="rounded-none border border-[#0A0A0A] bg-[#EAE8E3] px-2 py-0.5 font-mono text-xs font-semibold text-[#0A0A0A] tabular-nums">
                {formatCount(transmittals?.total)} records
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5">
                <span className="font-mono text-[#4A4945]">Total transmittals</span>
                <span className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                  {formatCount(transmittals?.total)}
                </span>
              </div>
            </div>
          </div>

          <StatusBreakdownList
            title="Transmittals by status"
            total={transmittals?.total ?? 0}
            byStatus={transmittals?.byStatus}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Consolidated View (ALL Entity Scope)
// ============================================================================

function ConsolidatedAnalyticsView({ data }: { data: ConsolidatedAnalyticsData }) {
  const { ATA, LTA } = data.analyticsByEntity;

  // Invoice statuses
  const invoiceStatuses = getUniqueKeys(ATA.invoices?.byStatus, LTA.invoices?.byStatus);
  // Disbursement statuses
  const disbursementStatuses = getUniqueKeys(
    ATA.disbursements?.byStatus,
    LTA.disbursements?.byStatus
  );
  // Transmittal statuses
  const transmittalStatuses = getUniqueKeys(
    ATA.transmittals?.byStatus,
    LTA.transmittals?.byStatus
  );

  return (
    <div className="space-y-6" data-testid="consolidated-analytics-view">
      <ReportSection
        title="Consolidated Enterprise Analytics"
        dataTestId="section-consolidated-enterprise"
      >
        <p className="text-xs sm:text-sm text-[#4A4945] mb-5">
          Comparative performance across ATA and LTA entities. Combined operational record counts
          represent summed entity records across entities, not deduplicated customers.
        </p>

        <div className="space-y-6">
          {/* 1. Financial Metrics Table */}
          <div className="space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
              Financial metrics
            </h3>
            <ReportTableContainer minWidth="min-w-[600px]" ariaLabel="Financial metrics comparison">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      Metric
                    </th>
                    <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      ATA
                    </th>
                    <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      LTA
                    </th>
                    <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      Combined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C8C5BC]">
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Total billed</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(ATA.revenue?.totalBilled)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(LTA.revenue?.totalBilled)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(
                        (ATA.revenue?.totalBilled || 0) + (LTA.revenue?.totalBilled || 0)
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Total collected</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(ATA.revenue?.totalCollected)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(LTA.revenue?.totalCollected)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(
                        (ATA.revenue?.totalCollected || 0) + (LTA.revenue?.totalCollected || 0)
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Total outstanding</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(ATA.revenue?.totalOutstanding)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(LTA.revenue?.totalOutstanding)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(
                        (ATA.revenue?.totalOutstanding || 0) + (LTA.revenue?.totalOutstanding || 0)
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Total expenses</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(ATA.revenue?.totalExpenses)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCurrency(LTA.revenue?.totalExpenses)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(
                        (ATA.revenue?.totalExpenses || 0) + (LTA.revenue?.totalExpenses || 0)
                      )}
                    </td>
                  </tr>
                  <tr className="bg-[#EAE8E3] border-t-2 border-[#0A0A0A]">
                    <td className="px-4 py-2.5 font-bold text-[#0A0A0A]">Net operating income</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(ATA.revenue?.netIncome)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(LTA.revenue?.netIncome)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCurrency(
                        (ATA.revenue?.netIncome || 0) + (LTA.revenue?.netIncome || 0)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </ReportTableContainer>
          </div>

          {/* 2. Operational Record Totals Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                Record totals
              </h3>
              <span className="text-xs text-[#4A4945]">
                Summed entity records (not deduplicated customers)
              </span>
            </div>
            <ReportTableContainer minWidth="min-w-[600px]" ariaLabel="Record totals comparison">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      Metric
                    </th>
                    <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      ATA
                    </th>
                    <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      LTA
                    </th>
                    <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                      Combined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C8C5BC]">
                  <tr>
                    <td className="px-4 py-2.5 text-[#0A0A0A]">
                      <span className="font-medium text-[#0A0A0A] block">Combined Clients</span>
                      <span className="text-xs text-[#4A4945] block">
                        Summed entity records (not deduplicated customers)
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(ATA.clients?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(LTA.clients?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCount((ATA.clients?.total || 0) + (LTA.clients?.total || 0))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Work requests</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(ATA.workRequests?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(LTA.workRequests?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCount((ATA.workRequests?.total || 0) + (LTA.workRequests?.total || 0))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Active documents</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(ATA.documents?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(LTA.documents?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCount((ATA.documents?.total || 0) + (LTA.documents?.total || 0))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Invoices</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(ATA.invoices?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(LTA.invoices?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCount((ATA.invoices?.total || 0) + (LTA.invoices?.total || 0))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Disbursements</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(ATA.disbursements?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(LTA.disbursements?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCount(
                        (ATA.disbursements?.total || 0) + (LTA.disbursements?.total || 0)
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-[#0A0A0A]">Transmittals</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(ATA.transmittals?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0A0A0A]">
                      {formatCount(LTA.transmittals?.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                      {formatCount((ATA.transmittals?.total || 0) + (LTA.transmittals?.total || 0))} records
                    </td>
                  </tr>
                </tbody>
              </table>
            </ReportTableContainer>
          </div>

          {/* 3. Status Comparisons Tables */}
          <div className="space-y-4">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
              Status comparisons
            </h3>

            {/* Invoices Status Breakdown */}
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-semibold text-[#4A4945] uppercase tracking-wider">
                Invoices by status
              </h4>
              <ReportTableContainer minWidth="min-w-[600px]" ariaLabel="Invoices status comparison">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        ATA
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        LTA
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        Combined
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#C8C5BC]">
                    {invoiceStatuses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-center text-xs text-[#4A4945] italic font-mono">
                          No invoice status data available
                        </td>
                      </tr>
                    ) : (
                      invoiceStatuses.map((st) => {
                        const countATA = ATA.invoices?.byStatus?.[st] ?? 0;
                        const countLTA = LTA.invoices?.byStatus?.[st] ?? 0;
                        return (
                          <tr key={st}>
                            <td className="px-4 py-2 text-[#0A0A0A] font-medium">{st}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                              {formatCount(countATA)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                              {formatCount(countLTA)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                              {formatCount(countATA + countLTA)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </ReportTableContainer>
            </div>

            {/* Disbursements Status Breakdown & Amounts */}
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-semibold text-[#4A4945] uppercase tracking-wider">
                Disbursements by status & amounts
              </h4>
              <ReportTableContainer minWidth="min-w-[600px]" ariaLabel="Disbursements comparison">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        Detail / Status
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        ATA
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        LTA
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        Combined
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#C8C5BC]">
                    <tr className="bg-[#EAE8E3]/60">
                      <td className="px-4 py-2 font-medium text-[#0A0A0A]">Total recorded amount</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                        {formatCurrency(ATA.disbursements?.totalAmount)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                        {formatCurrency(LTA.disbursements?.totalAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                        {formatCurrency(
                          (ATA.disbursements?.totalAmount || 0) +
                            (LTA.disbursements?.totalAmount || 0)
                        )}
                      </td>
                    </tr>
                    <tr className="bg-[#EAE8E3]/60">
                      <td className="px-4 py-2 font-medium text-[#0A0A0A]">Released amount</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                        {formatCurrency(ATA.disbursements?.releasedAmount)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                        {formatCurrency(LTA.disbursements?.releasedAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                        {formatCurrency(
                          (ATA.disbursements?.releasedAmount || 0) +
                            (LTA.disbursements?.releasedAmount || 0)
                        )}
                      </td>
                    </tr>
                    {disbursementStatuses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-center text-xs text-[#4A4945] italic font-mono">
                          No disbursement status data available
                        </td>
                      </tr>
                    ) : (
                      disbursementStatuses.map((st) => {
                        const countATA = ATA.disbursements?.byStatus?.[st] ?? 0;
                        const countLTA = LTA.disbursements?.byStatus?.[st] ?? 0;
                        return (
                          <tr key={st}>
                            <td className="px-4 py-2 text-[#0A0A0A] font-medium">{st}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                              {formatCount(countATA)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                              {formatCount(countLTA)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                              {formatCount(countATA + countLTA)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </ReportTableContainer>
            </div>

            {/* Transmittals Status Breakdown */}
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-semibold text-[#4A4945] uppercase tracking-wider">
                Transmittals by status
              </h4>
              <ReportTableContainer minWidth="min-w-[600px]" ariaLabel="Transmittals status comparison">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        ATA
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        LTA
                      </th>
                      <th className="px-4 py-2.5 text-right font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">
                        Combined
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#C8C5BC]">
                    {transmittalStatuses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-center text-xs text-[#4A4945] italic font-mono">
                          No transmittal status data available
                        </td>
                      </tr>
                    ) : (
                      transmittalStatuses.map((st) => {
                        const countATA = ATA.transmittals?.byStatus?.[st] ?? 0;
                        const countLTA = LTA.transmittals?.byStatus?.[st] ?? 0;
                        return (
                          <tr key={st}>
                            <td className="px-4 py-2 text-[#0A0A0A] font-medium">{st}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                              {formatCount(countATA)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0A0A0A]">
                              {formatCount(countLTA)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-[#0A0A0A]">
                              {formatCount(countATA + countLTA)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </ReportTableContainer>
            </div>
          </div>
        </div>
      </ReportSection>
    </div>
  );
}

// ============================================================================
// Main Tab Export
// ============================================================================

export function AnalyticsOverviewTab() {
  const { data, isLoading, error, refetch, isRefetching } = useReportsAnalytics();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  if (isLoading) {
    return <ReportLoadingState type="full" dataTestId="analytics-loading" />;
  }

  if (error) {
    return (
      <ReportErrorState
        title="Unable to load operational analytics"
        message={
          error instanceof Error ? error.message : 'Please check your connection and try again.'
        }
        onRetry={() => refetch()}
        dataTestId="analytics-error"
      />
    );
  }

  const isConsolidated =
    activeEntity === 'ALL' || (Boolean(data) && 'analyticsByEntity' in (data as object));

  return (
    <div className="space-y-6" data-testid="analytics-overview-tab">
      {/* Context Toolbar */}
      <ReportToolbar dataTestId="analytics-toolbar">
        <ReportToolbarGroup align="left">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
              Scope:
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] font-mono text-xs font-semibold text-[#0A0A0A]">
              {activeEntity === 'ALL' ? 'ALL (Consolidated)' : activeEntity}
            </span>
          </div>
        </ReportToolbarGroup>

        <ReportToolbarGroup align="right">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs font-mono font-semibold h-8 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] transition-colors cursor-pointer gap-1.5 shadow-none"
            data-testid="analytics-refresh-button"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefetching && 'animate-spin')} />
            <span>Refresh</span>
          </Button>
        </ReportToolbarGroup>
      </ReportToolbar>

      {/* View Branching */}
      {isConsolidated && data && 'analyticsByEntity' in data ? (
        <ConsolidatedAnalyticsView data={data as ConsolidatedAnalyticsData} />
      ) : data && 'clients' in data ? (
        <SingleAnalyticsView data={data as AnalyticsData} />
      ) : (
        <ReportEmptyState
          title="No analytics data available"
          description="There is no recorded operational data for the selected entity."
          dataTestId="analytics-empty-state"
        />
      )}
    </div>
  );
}
