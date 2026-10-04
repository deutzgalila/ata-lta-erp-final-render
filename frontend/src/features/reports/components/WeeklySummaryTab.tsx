import { useState, useMemo } from 'react';
import {
  CalendarRange,
  Briefcase,
  Receipt,
  CreditCard,
  Send,
  DollarSign,
  RefreshCw,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { useWeeklyReport } from '../api/useReports';
import { formatCurrency, formatDate, getTodayString, getWeekBounds } from '../utils/formatters';

export function WeeklySummaryTab() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const { data, isLoading, error, refetch, isRefetching } = useWeeklyReport(selectedDate);

  const weekBounds = useMemo(() => {
    if (data?.weekStart && data?.weekEnd) {
      return { start: data.weekStart, end: data.weekEnd };
    }
    return getWeekBounds(selectedDate);
  }, [data, selectedDate]);

  const summary = data?.summary || {
    workRequests: 0,
    invoices: 0,
    invoicesTotal: 0,
    payments: 0,
    paymentsTotal: 0,
    disbursements: 0,
    disbursementsTotal: 0,
    documents: 0,
    transmittals: 0,
  };

  const details = data?.details || {
    workRequests: [],
    invoices: [],
    payments: [],
    disbursements: [],
    documents: [],
    transmittals: [],
  };

  return (
    <div className="space-y-6" data-testid="weekly-summary-tab">
      {/* 1. Header & Date Picker Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-indigo-600" />
            <span>Weekly Activity Summary</span>
          </h2>
          <p className="text-xs text-slate-500">
            Consolidated 7-day activity spanning Monday 00:00:00Z to Sunday 23:59:59Z.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-600">Week of:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || getTodayString())}
              className="h-7 text-xs w-36 border-none bg-transparent shadow-none p-0 focus-visible:ring-0"
              data-testid="weekly-date-picker"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs gap-1.5 cursor-pointer"
            data-testid="weekly-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Week Range Banner */}
      <div
        className="px-4 py-3 bg-indigo-50/60 border border-indigo-200 rounded-xl flex items-center justify-between"
        data-testid="weekly-bounds-header"
      >
        <div className="flex items-center gap-2 text-indigo-900 font-semibold text-xs">
          <CalendarRange className="w-4 h-4 text-indigo-600" />
          <span>
            Active Week Range: {formatDate(weekBounds.start)} (Mon) – {formatDate(weekBounds.end)} (Sun)
          </span>
        </div>
        <Badge variant="outline" className="bg-white text-indigo-700 border-indigo-200 text-[10px]">
          {weekBounds.start} ~ {weekBounds.end}
        </Badge>
      </div>

      {isLoading ? (
        <div
          className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200"
          data-testid="weekly-loading"
        >
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
          <p className="text-xs">Loading weekly activity summary...</p>
        </div>
      ) : error ? (
        <div
          className="p-8 text-center bg-white rounded-xl border border-rose-200 space-y-3"
          data-testid="weekly-error"
        >
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">Unable to load weekly summary</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {error instanceof Error ? error.message : 'Please check your connection and try again.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="text-xs cursor-pointer"
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          {/* 2. 9 Summary KPI Badges Grid */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2.5"
            data-testid="weekly-kpi-grid"
          >
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-work-requests">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Work Requests
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.workRequests}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-invoices">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Invoices
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.invoices}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-invoices-total">
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide block">
                Invoice Total
              </span>
              <span className="text-sm font-bold text-emerald-700 mt-1 block font-mono truncate">
                {formatCurrency(summary.invoicesTotal)}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-payments">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Payments
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.payments}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-payments-total">
              <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide block">
                Payment Total
              </span>
              <span className="text-sm font-bold text-indigo-700 mt-1 block font-mono truncate">
                {formatCurrency(summary.paymentsTotal)}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-disbursements">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Disbursements
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.disbursements}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-disbursements-total">
              <span className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide block">
                Disb. Total
              </span>
              <span className="text-sm font-bold text-purple-700 mt-1 block font-mono truncate">
                {formatCurrency(summary.disbursementsTotal)}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-documents">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Documents
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.documents}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-transmittals">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Transmittals
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.transmittals}
              </span>
            </div>
          </div>

          {/* 3. 6 Itemized Detail Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Work Requests */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  <span>Work Requests ({details.workRequests.length})</span>
                </h3>
              </div>
              {details.workRequests.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No work requests created in this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Title</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.workRequests.map((wr) => (
                      <TableRow key={wr.id}>
                        <TableCell className="text-xs font-medium text-slate-900">
                          {wr.title}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary" className="text-[10px]">
                            {wr.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(wr.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Invoices */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>Invoices ({details.invoices.length})</span>
                </h3>
              </div>
              {details.invoices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No invoices issued in this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Invoice #</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900">
                          {inv.invoice_number}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary" className="text-[10px]">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-800 text-right">
                          {formatCurrency(inv.total)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(inv.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Payments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Payments ({details.payments.length})</span>
                </h3>
              </div>
              {details.payments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No payments received in this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Amount</TableHead>
                      <TableHead className="text-xs font-semibold">Method</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs font-mono font-bold text-emerald-600">
                          {formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{p.method}</TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(p.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Disbursements */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                  <span>Disbursements ({details.disbursements.length})</span>
                </h3>
              </div>
              {details.disbursements.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No disbursements filed in this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Disbursement #</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.disbursements.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900">
                          {d.disbursement_number}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary" className="text-[10px]">
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-800 text-right">
                          {formatCurrency(d.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(d.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Documents */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-teal-600" />
                  <span>Documents ({details.documents.length})</span>
                </h3>
              </div>
              {details.documents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No documents uploaded in this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">File Name</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="text-xs font-medium text-slate-900 truncate max-w-[220px]">
                          {doc.original_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(doc.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Transmittals */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Transmittals ({details.transmittals.length})</span>
                </h3>
              </div>
              {details.transmittals.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No transmittals created in this week.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Tracking #</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.transmittals.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900">
                          {t.tracking_number}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary" className="text-[10px]">
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(t.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
