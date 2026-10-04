import { useState } from 'react';
import {
  Clock,
  CreditCard,
  RefreshCw,
  AlertCircle,
  Receipt,
  FileWarning,
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
import { useMonthlyPending } from '../api/useReports';
import { formatCurrency, formatDate, getCurrentMonthString } from '../utils/formatters';

export function MonthlyPendingTab() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthString());
  const { data, isLoading, error, refetch, isRefetching } = useMonthlyPending(selectedMonth);

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

  return (
    <div className="space-y-6" data-testid="monthly-pending-tab">
      {/* 1. Header & Month Selector Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <span>Monthly Pending & Action Items</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time attention queue tracking overdue invoices, pending disbursements, and stale draft transmittals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-600">Month:</span>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthString())}
              className="h-7 text-xs w-36 border-none bg-transparent shadow-none p-0 focus-visible:ring-0"
              data-testid="monthly-month-picker"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs gap-1.5 cursor-pointer"
            data-testid="monthly-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div
          className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200"
          data-testid="monthly-loading"
        >
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mb-2"></div>
          <p className="text-xs">Loading pending items for {selectedMonth}...</p>
        </div>
      ) : error ? (
        <div
          className="p-8 text-center bg-white rounded-xl border border-rose-200 space-y-3"
          data-testid="monthly-error"
        >
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">Unable to load pending report</h3>
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
          {/* 2. 5 Summary KPI Cards Grid */}
          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
            data-testid="monthly-kpi-grid"
          >
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-overdue-invoices">
              <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wide block">
                Overdue Invoices
              </span>
              <span className="text-xl font-bold text-rose-700 mt-1 block">
                {overdueInvoices.count}
              </span>
              <span className="text-[10px] text-slate-400">Due &le; {selectedMonth}-31</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-overdue-outstanding">
              <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide block">
                Outstanding Balance
              </span>
              <span className="text-base font-bold text-amber-700 mt-1 block font-mono truncate">
                {formatCurrency(overdueInvoices.totalOutstanding)}
              </span>
              <span className="text-[10px] text-slate-400">Total overdue balance</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-pending-disbursements">
              <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide block">
                Pending Disbursements
              </span>
              <span className="text-xl font-bold text-purple-700 mt-1 block">
                {pendingDisbursements.count}
              </span>
              <span className="text-[10px] text-slate-400">Awaiting release</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-pending-disb-total">
              <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide block">
                Pending Disb. Total
              </span>
              <span className="text-base font-bold text-purple-800 mt-1 block font-mono truncate">
                {formatCurrency(pendingDisbursements.totalAmount)}
              </span>
              <span className="text-[10px] text-slate-400">Pending/Approved amount</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-stale-transmittals">
              <span className="text-[11px] font-semibold text-cyan-600 uppercase tracking-wide block">
                Stale Transmittals
              </span>
              <span className="text-xl font-bold text-cyan-700 mt-1 block">
                {staleTransmittals.count}
              </span>
              <span className="text-[10px] text-slate-400">Draft &gt; 7 days old</span>
            </div>
          </div>

          {/* 3. 3 Detail Tables */}
          <div className="space-y-6">
            {/* Table 1: Overdue Invoices */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-rose-600" />
                  <span>Overdue Invoices ({overdueInvoices.items.length})</span>
                </h3>
                <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[10px]">
                  Requires Collection
                </Badge>
              </div>

              {overdueInvoices.items.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No overdue invoices found for this period. All invoices are settled or current.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Invoice #</TableHead>
                      <TableHead className="text-xs font-semibold">Client Name</TableHead>
                      <TableHead className="text-xs font-semibold">Due Date</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Total Amount</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Outstanding Balance</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueInvoices.items.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900">
                          {inv.invoice_number}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-700">
                          {inv.clients?.name || 'Unknown Client'}
                        </TableCell>
                        <TableCell className="text-xs text-rose-600 font-mono font-semibold">
                          {formatDate(inv.due_date)}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-600 text-right">
                          {formatCurrency(inv.total)}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-bold text-rose-600 text-right">
                          {formatCurrency(inv.balance)}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <Badge variant="secondary" className="text-[10px]">
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Table 2: Pending Disbursements */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                  <span>Pending Disbursements Queue ({pendingDisbursements.items.length})</span>
                </h3>
                <Badge variant="outline" className="text-purple-700 border-purple-200 bg-purple-50 text-[10px]">
                  Pending / Approved
                </Badge>
              </div>

              {pendingDisbursements.items.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No disbursements pending approval or release.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Disbursement #</TableHead>
                      <TableHead className="text-xs font-semibold">Category</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingDisbursements.items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900">
                          {d.disbursement_number}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {d.category || 'General'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant={d.status === 'Approved' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono font-bold text-purple-700 text-right">
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

            {/* Table 3: Stale Draft Transmittals */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileWarning className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Stale Draft Transmittals ({staleTransmittals.items.length})</span>
                </h3>
                <Badge variant="outline" className="text-cyan-700 border-cyan-200 bg-cyan-50 text-[10px]">
                  Draft &gt; 7 Days
                </Badge>
              </div>

              {staleTransmittals.items.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No stale draft transmittals. All draft transmittals are recent or dispatched.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Tracking #</TableHead>
                      <TableHead className="text-xs font-semibold">Client Name</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staleTransmittals.items.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900">
                          {t.tracking_number}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-700">
                          {t.clients?.name || 'Unknown Client'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                            {t.status || 'Draft'}
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
