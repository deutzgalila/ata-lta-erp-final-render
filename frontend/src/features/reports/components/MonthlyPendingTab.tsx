import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { useMonthlyPending } from '../api/useReports';
import { useSessionStore } from '@/lib/session';
import {
  formatCurrency,
  formatCount,
  formatManilaDate,
  getCurrentMonthString,
} from '../utils/formatters';
import {
  ReportToolbar,
  ReportToolbarGroup,
  ReportSection,
  ReportTableContainer,
  ReportScopePrompt,
  ReportLoadingState,
  ReportErrorState,
} from './';
import { shiftMonths, scrollToReportSection } from './periodicReportHelpers';

export function MonthlyPendingTab() {
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthString());
  const { data, isLoading, error, refetch, isRefetching } = useMonthlyPending(selectedMonth, {
    enabled: activeEntity !== 'ALL',
  });

  if (activeEntity === 'ALL') {
    return (
      <div data-testid="monthly-pending-tab" className="space-y-6">
        <ReportScopePrompt />
      </div>
    );
  }

  const overdueInvoices = data?.overdueInvoices || {
    count: 0,
    totalOutstanding: 0,
    items: [],
  };

  const pendingDisbursements = data?.pendingDisbursements || {
    count: 0,
    totalAmount: 0,
    items: [],
  };

  const staleTransmittals = data?.staleTransmittals || {
    count: 0,
    items: [],
  };

  const handlePrevMonth = () => {
    setSelectedMonth((prev) => shiftMonths(prev || getCurrentMonthString(), -1));
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => shiftMonths(prev || getCurrentMonthString(), 1));
  };

  const handleThisMonth = () => {
    setSelectedMonth(getCurrentMonthString());
  };

  return (
    <div className="space-y-6" data-testid="monthly-pending-tab">
      {/* 1. Contextual Toolbar */}
      <ReportToolbar dataTestId="monthly-toolbar">
        <ReportToolbarGroup align="left">
          <label htmlFor="monthly-month-picker" className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] shrink-0">
            Month
          </label>
          <DateInput
            id="monthly-month-picker"
            aria-label="Report month"
            type="month"
            value={selectedMonth}
            onValueChange={(value) => setSelectedMonth(value || getCurrentMonthString())}
            className="w-[184px] rounded-none border border-[#0A0A0A] bg-white font-mono text-xs"
            data-testid="monthly-month-picker"
          />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              title="Previous month"
              className="h-9 w-9 p-0 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#E4E2DC] text-[#0A0A0A] cursor-pointer shadow-none"
              data-testid="monthly-prev-month-btn"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNextMonth}
              aria-label="Next month"
              title="Next month"
              className="h-9 w-9 p-0 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#E4E2DC] text-[#0A0A0A] cursor-pointer shadow-none"
              data-testid="monthly-next-month-btn"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleThisMonth}
            className="h-9 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#E4E2DC] text-[#0A0A0A] font-mono text-xs font-semibold cursor-pointer shadow-none"
            data-testid="monthly-this-month-btn"
          >
            This month
          </Button>
        </ReportToolbarGroup>

        <ReportToolbarGroup align="right">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-9 px-3 text-xs font-mono font-semibold gap-1.5 cursor-pointer rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] text-[#0A0A0A] transition-colors shadow-none"
            data-testid="monthly-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </ReportToolbarGroup>
      </ReportToolbar>

      {/* 2. Loading / Error / Data Content */}
      {isLoading ? (
        <ReportLoadingState type="full" dataTestId="monthly-loading" />
      ) : error ? (
        <ReportErrorState
          dataTestId="monthly-error"
          title="Unable to load pending report"
          message={error instanceof Error ? error.message : 'Please check your connection and try again.'}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {/* 3. 3 Summary Groups combining counts with available amounts */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4"
            data-testid="monthly-kpi-grid"
          >
            {/* Group 1: Overdue Invoices */}
            <button
              type="button"
              onClick={() => scrollToReportSection('section-monthly-overdue-invoices')}
              className="bg-[#FAF9F5] rounded-none border border-[#0A0A0A] hover:bg-[#E4E2DC] p-4 shadow-none transition-colors text-left cursor-pointer flex flex-col justify-between"
              data-testid="card-overdue-invoices"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
                    Overdue invoices
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-semibold bg-[#EAE8E3] text-[#0A0A0A]">
                    Follow-up
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className="font-mono text-2xl font-bold text-[#0A0A0A] tabular-nums"
                    data-testid="kpi-overdue-invoices"
                  >
                    {formatCount(overdueInvoices.count)}
                  </span>
                  <span
                    className="font-mono text-lg sm:text-xl font-bold text-[#0A0A0A] tabular-nums"
                    data-testid="kpi-overdue-outstanding"
                  >
                    {formatCurrency(overdueInvoices.totalOutstanding)}
                  </span>
                </div>
              </div>
              <div className="font-mono text-xs text-[#4A4945] mt-3 pt-2.5 border-t border-[#C8C5BC]">
                Invoices due on or before {selectedMonth}-31 with balance &gt; 0
              </div>
            </button>

            {/* Group 2: Pending Disbursements */}
            <button
              type="button"
              onClick={() => scrollToReportSection('section-monthly-pending-disbursements')}
              className="bg-[#FAF9F5] rounded-none border border-[#0A0A0A] hover:bg-[#E4E2DC] p-4 shadow-none transition-colors text-left cursor-pointer flex flex-col justify-between"
              data-testid="card-pending-disbursements"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
                    Pending disbursements
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-semibold bg-[#EAE8E3] text-[#0A0A0A]">
                    Queue
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className="font-mono text-2xl font-bold text-[#0A0A0A] tabular-nums"
                    data-testid="kpi-pending-disbursements"
                  >
                    {formatCount(pendingDisbursements.count)}
                  </span>
                  <span
                    className="font-mono text-lg sm:text-xl font-bold text-[#0A0A0A] tabular-nums"
                    data-testid="kpi-pending-disb-total"
                  >
                    {formatCurrency(pendingDisbursements.totalAmount)}
                  </span>
                </div>
              </div>
              <div className="font-mono text-xs text-[#4A4945] mt-3 pt-2.5 border-t border-[#C8C5BC]">
                Current active queue awaiting approval or release
              </div>
            </button>

            {/* Group 3: Stale Transmittals */}
            <button
              type="button"
              onClick={() => scrollToReportSection('section-monthly-stale-transmittals')}
              className="bg-[#FAF9F5] rounded-none border border-[#0A0A0A] hover:bg-[#E4E2DC] p-4 shadow-none transition-colors text-left cursor-pointer flex flex-col justify-between"
              data-testid="card-stale-transmittals"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
                    Stale transmittals
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-semibold bg-[#EAE8E3] text-[#0A0A0A]">
                    &gt; 7 days draft
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className="font-mono text-2xl font-bold text-[#0A0A0A] tabular-nums"
                    data-testid="kpi-stale-transmittals"
                  >
                    {formatCount(staleTransmittals.count)}
                  </span>
                </div>
              </div>
              <div className="font-mono text-xs text-[#4A4945] mt-3 pt-2.5 border-t border-[#C8C5BC]">
                Draft transmittals created more than 7 days ago
              </div>
            </button>
          </div>

          {/* 4. 3 Full-Width Itemized Detail Tables */}
          <div className="space-y-6">
            {/* Table 1: Overdue Invoices */}
            <ReportSection
              id="section-monthly-overdue-invoices"
              dataTestId="monthly-overdue-invoices-section"
              title="Overdue invoices"
              badgeCount={overdueInvoices.items.length}
              collapsible
            >
              {overdueInvoices.items.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No overdue invoices found for this period. All invoices are settled or current.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[640px]" ariaLabel="Overdue invoices table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="w-36">Due Date</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-36 text-right">Invoice Total</TableHead>
                        <TableHead className="w-36 text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueInvoices.items.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {inv.invoice_number}
                          </TableCell>
                          <TableCell className="font-medium text-[#0A0A0A]">
                            {inv.clients?.name || 'Unknown Client'}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#0A0A0A] tabular-nums">
                            {formatManilaDate(inv.due_date)}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-medium bg-[#EAE8E3] text-[#0A0A0A]">
                              {inv.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatCurrency(inv.total)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-[#0A0A0A] tabular-nums">
                            {formatCurrency(inv.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 2: Pending Disbursements */}
            <ReportSection
              id="section-monthly-pending-disbursements"
              dataTestId="monthly-pending-disbursements-section"
              title="Pending disbursements"
              badgeCount={pendingDisbursements.items.length}
              collapsible
            >
              {pendingDisbursements.items.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No disbursements pending approval or release.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[580px]" ariaLabel="Pending disbursements table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Disbursement #</TableHead>
                        <TableHead className="w-36">Category</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-36 text-right">Created</TableHead>
                        <TableHead className="w-40 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingDisbursements.items.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {d.disbursement_number}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#4A4945]">
                            {d.category || 'General'}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-none border font-mono text-xs font-medium ${
                                d.status === 'Approved'
                                  ? 'border-[#0A0A0A] bg-[#0A0A0A] text-[#FAF9F5]'
                                  : 'border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A]'
                              }`}
                            >
                              {d.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(d.created_at)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-[#0A0A0A] tabular-nums">
                            {formatCurrency(d.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 3: Stale Draft Transmittals */}
            <ReportSection
              id="section-monthly-stale-transmittals"
              dataTestId="monthly-stale-transmittals-section"
              title="Stale transmittals"
              badgeCount={staleTransmittals.items.length}
              collapsible
            >
              {staleTransmittals.items.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No stale draft transmittals. All draft transmittals are recent or dispatched.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[540px]" ariaLabel="Stale transmittals table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-36 text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staleTransmittals.items.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {t.tracking_number}
                          </TableCell>
                          <TableCell className="font-medium text-[#0A0A0A]">
                            {t.clients?.name || 'Unknown Client'}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#B87500] font-mono text-xs font-medium bg-[#FDF3D7] text-[#734800]">
                              {t.status || 'Draft'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(t.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>
          </div>
        </>
      )}
    </div>
  );
}
