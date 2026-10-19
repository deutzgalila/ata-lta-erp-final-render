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
import { useDailyReport } from '../api/useReports';
import { useSessionStore } from '@/lib/session';
import {
  formatCurrency,
  formatCount,
  formatManilaDate,
  getTodayString,
} from '../utils/formatters';
import {
  ReportToolbar,
  ReportToolbarGroup,
  ReportSummaryBand,
  ReportSummaryCard,
  ReportSection,
  ReportTableContainer,
  ReportScopePrompt,
  ReportLoadingState,
  ReportErrorState,
} from './';
import { shiftDays, scrollToReportSection } from './periodicReportHelpers';

export function DailyActivityTab() {
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const { data, isLoading, error, refetch, isRefetching } = useDailyReport(selectedDate, {
    enabled: activeEntity !== 'ALL',
  });

  if (activeEntity === 'ALL') {
    return (
      <div data-testid="daily-activity-tab" className="space-y-6">
        <ReportScopePrompt />
      </div>
    );
  }

  const summary = data?.summary || {
    workRequests: 0,
    documents: 0,
    invoices: 0,
    invoicesTotal: 0,
    payments: 0,
    paymentsTotal: 0,
    disbursements: 0,
    disbursementsTotal: 0,
    transmittals: 0,
  };

  const workRequests = data?.workRequests || [];
  const documents = data?.documents || [];
  const invoices = data?.invoices || [];
  const payments = data?.payments || [];
  const disbursements = data?.disbursements || [];
  const transmittals = data?.transmittals || [];

  const handlePrevDay = () => {
    setSelectedDate((prev) => shiftDays(prev || getTodayString(), -1));
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => shiftDays(prev || getTodayString(), 1));
  };

  const handleToday = () => {
    setSelectedDate(getTodayString());
  };

  return (
    <div className="space-y-6" data-testid="daily-activity-tab">
      {/* 1. Contextual Toolbar */}
      <ReportToolbar dataTestId="daily-toolbar">
        <ReportToolbarGroup align="left">
          <label htmlFor="daily-date-picker" className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] shrink-0">
            Date
          </label>
          <DateInput
            id="daily-date-picker"
            aria-label="Report date"
            type="date"
            value={selectedDate}
            onValueChange={(value) => setSelectedDate(value || getTodayString())}
            className="w-[176px] rounded-none border border-[#0A0A0A] bg-white font-mono text-xs"
            data-testid="daily-date-picker"
          />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevDay}
              aria-label="Previous day"
              title="Previous day"
              className="h-9 w-9 p-0 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#E4E2DC] text-[#0A0A0A] cursor-pointer shadow-none"
              data-testid="daily-prev-day-btn"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNextDay}
              aria-label="Next day"
              title="Next day"
              className="h-9 w-9 p-0 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#E4E2DC] text-[#0A0A0A] cursor-pointer shadow-none"
              data-testid="daily-next-day-btn"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="h-9 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#E4E2DC] text-[#0A0A0A] font-mono text-xs font-semibold cursor-pointer shadow-none"
            data-testid="daily-today-btn"
          >
            Today
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
            data-testid="daily-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </ReportToolbarGroup>
      </ReportToolbar>

      {/* 2. Loading / Error / Data Content */}
      {isLoading ? (
        <ReportLoadingState type="full" dataTestId="daily-loading" />
      ) : error ? (
        <ReportErrorState
          dataTestId="daily-error"
          title="Unable to load daily report"
          message={error instanceof Error ? error.message : 'Please check your connection and try again.'}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {/* 3. 3-Cell Monetary Summary Band */}
          <ReportSummaryBand columns={3}>
            <ReportSummaryCard
              label="Invoice total"
              value={formatCurrency(summary.invoicesTotal)}
              dataTestId="kpi-invoices-total"
            />
            <ReportSummaryCard
              label="Payments received"
              value={formatCurrency(summary.paymentsTotal)}
              dataTestId="kpi-payments-total"
            />
            <ReportSummaryCard
              label="Disbursement total"
              value={formatCurrency(summary.disbursementsTotal)}
              dataTestId="kpi-disbursements-total"
            />
          </ReportSummaryBand>

          {/* 4. Compact Category Count Strip */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5"
            data-testid="daily-kpi-grid"
          >
            {[
              {
                id: 'workRequests',
                label: 'Work requests',
                count: summary.workRequests,
                testId: 'kpi-work-requests',
                targetId: 'section-daily-work-requests',
              },
              {
                id: 'invoices',
                label: 'Invoices',
                count: summary.invoices,
                testId: 'kpi-invoices',
                targetId: 'section-daily-invoices',
              },
              {
                id: 'payments',
                label: 'Payments',
                count: summary.payments,
                testId: 'kpi-payments',
                targetId: 'section-daily-payments',
              },
              {
                id: 'disbursements',
                label: 'Disbursements',
                count: summary.disbursements,
                testId: 'kpi-disbursements',
                targetId: 'section-daily-disbursements',
              },
              {
                id: 'documents',
                label: 'Documents',
                count: summary.documents,
                testId: 'kpi-documents',
                targetId: 'section-daily-documents',
              },
              {
                id: 'transmittals',
                label: 'Transmittals',
                count: summary.transmittals,
                testId: 'kpi-transmittals',
                targetId: 'section-daily-transmittals',
              },
            ].map((cat) => (
              <button
                type="button"
                key={cat.id}
                data-testid={cat.testId}
                onClick={() => scrollToReportSection(cat.targetId)}
                className="flex items-center justify-between gap-2 p-3 bg-[#FAF9F5] rounded-none border border-[#0A0A0A] hover:bg-[#E4E2DC] transition-colors cursor-pointer text-left shadow-none"
              >
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] leading-snug">
                  {cat.label}
                </span>
                <span className="font-mono text-xs font-bold text-[#0A0A0A] tabular-nums px-2 py-0.5 rounded-none border border-[#0A0A0A] bg-[#EAE8E3]">
                  {formatCount(cat.count)}
                </span>
              </button>
            ))}
          </div>

          {/* 5. 6 Full-Width Itemized Detail Tables */}
          <div className="space-y-6">
            {/* Table 1: Work Requests Created */}
            <ReportSection
              id="section-daily-work-requests"
              dataTestId="daily-work-requests-section"
              title="Work requests"
              badgeCount={workRequests.length}
              collapsible
            >
              {workRequests.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No work requests created on this date.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[540px]" ariaLabel="Work requests table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-36">Status</TableHead>
                        <TableHead className="w-40 text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workRequests.map((wr) => (
                        <TableRow key={wr.id}>
                          <TableCell className="font-medium text-[#0A0A0A]">
                            <span
                              className="line-clamp-2 max-w-xl break-words"
                              title={wr.title}
                            >
                              {wr.title}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-medium bg-[#EAE8E3] text-[#0A0A0A]">
                              {wr.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(wr.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 2: Invoices Issued */}
            <ReportSection
              id="section-daily-invoices"
              dataTestId="daily-invoices-section"
              title="Invoices"
              badgeCount={invoices.length}
              collapsible
            >
              {invoices.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No invoices issued on this date.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[560px]" ariaLabel="Invoices table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="w-36">Status</TableHead>
                        <TableHead className="w-40 text-right">Total</TableHead>
                        <TableHead className="w-40 text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {inv.invoice_number}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-medium bg-[#EAE8E3] text-[#0A0A0A]">
                              {inv.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {formatCurrency(inv.total)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(inv.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 3: Payments Received */}
            <ReportSection
              id="section-daily-payments"
              dataTestId="daily-payments-section"
              title="Payments"
              badgeCount={payments.length}
              collapsible
            >
              {payments.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No payments received on this date.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[560px]" ariaLabel="Payments table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-44 text-right">Amount</TableHead>
                        <TableHead className="w-36">Method</TableHead>
                        <TableHead>Invoice ID</TableHead>
                        <TableHead className="w-40 text-right">Payment Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-right font-mono font-bold text-[#0A0A0A] tabular-nums">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell className="text-[#0A0A0A] font-mono text-xs">{p.method}</TableCell>
                          <TableCell className="font-mono text-xs text-[#4A4945] tabular-nums">
                            {p.invoice_id ? (
                              <span title={p.invoice_id}>{p.invoice_id}</span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(p.payment_date || p.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 4: Disbursements Requested */}
            <ReportSection
              id="section-daily-disbursements"
              dataTestId="daily-disbursements-section"
              title="Disbursements"
              badgeCount={disbursements.length}
              collapsible
            >
              {disbursements.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No disbursements filed on this date.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[560px]" ariaLabel="Disbursements table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Disbursement #</TableHead>
                        <TableHead className="w-36">Status</TableHead>
                        <TableHead className="w-40 text-right">Amount</TableHead>
                        <TableHead className="w-40 text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disbursements.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {d.disbursement_number}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-medium bg-[#EAE8E3] text-[#0A0A0A]">
                              {d.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {formatCurrency(d.amount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(d.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 5: Documents Uploaded */}
            <ReportSection
              id="section-daily-documents"
              dataTestId="daily-documents-section"
              title="Documents"
              badgeCount={documents.length}
              collapsible
            >
              {documents.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No documents uploaded on this date.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[540px]" ariaLabel="Documents table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document Name</TableHead>
                        <TableHead className="w-40">Category</TableHead>
                        <TableHead className="w-40 text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium text-[#0A0A0A]">
                            <span
                              className="line-clamp-2 max-w-xl break-words"
                              title={doc.original_name}
                            >
                              {doc.original_name}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-medium bg-[#FAF9F5] text-[#0A0A0A]">
                              {doc.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#4A4945] tabular-nums">
                            {formatManilaDate(doc.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ReportTableContainer>
              )}
            </ReportSection>

            {/* Table 6: Transmittals Created */}
            <ReportSection
              id="section-daily-transmittals"
              dataTestId="daily-transmittals-section"
              title="Transmittals"
              badgeCount={transmittals.length}
              collapsible
            >
              {transmittals.length === 0 ? (
                <div className="p-6 text-center font-mono text-xs text-[#4A4945]">
                  No transmittals created on this date.
                </div>
              ) : (
                <ReportTableContainer minWidth="min-w-[540px]" ariaLabel="Transmittals table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking #</TableHead>
                        <TableHead className="w-36">Status</TableHead>
                        <TableHead className="w-40 text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transmittals.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono font-semibold text-[#0A0A0A] tabular-nums">
                            {t.tracking_number}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-medium bg-[#EAE8E3] text-[#0A0A0A]">
                              {t.status}
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
