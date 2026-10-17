import { useState } from 'react';
import {
  Calendar,
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
import { useDailyReport } from '../api/useReports';
import { formatCurrency, formatDate, getTodayString } from '../utils/formatters';

export function DailyActivityTab() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const { data, isLoading, error, refetch, isRefetching } = useDailyReport(selectedDate);

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

  return (
    <div className="space-y-6" data-testid="daily-activity-tab">
      {/* 1. Header & Date Picker Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span>Daily Activity Log</span>
          </h2>
          <p className="text-xs text-slate-500">
            Itemized breakdown of operations, invoicing, disbursements, and document activities for a single day.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-600">Date:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || getTodayString())}
              className="h-7 text-xs w-36 border-none bg-transparent shadow-none p-0 focus-visible:ring-0"
              data-testid="daily-date-picker"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs gap-1.5 cursor-pointer"
            data-testid="daily-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div
          className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200"
          data-testid="daily-loading"
        >
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-xs">Loading activity for {selectedDate}...</p>
        </div>
      ) : error ? (
        <div
          className="p-8 text-center bg-white rounded-xl border border-rose-200 space-y-3"
          data-testid="daily-error"
        >
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">Unable to load daily report</h3>
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
            data-testid="daily-kpi-grid"
          >
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs" data-testid="kpi-work-requests">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                Work Requests
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {summary.workRequests}
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
            {/* Work Requests Created */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  <span>Work Requests Created ({workRequests.length})</span>
                </h3>
              </div>
              {workRequests.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No work requests created on this date.
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
                    {workRequests.map((wr) => (
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

            {/* Invoices Issued */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>Invoices Issued ({invoices.length})</span>
                </h3>
              </div>
              {invoices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No invoices issued on this date.
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
                    {invoices.map((inv) => (
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

            {/* Payments Received */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Payments Received ({payments.length})</span>
                </h3>
              </div>
              {payments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No payments received on this date.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Amount</TableHead>
                      <TableHead className="text-xs font-semibold">Method</TableHead>
                      <TableHead className="text-xs font-semibold">Invoice ID</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs font-mono font-bold text-emerald-600">
                          {formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{p.method}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-500 truncate max-w-[120px]">
                          {p.invoice_id || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono text-right">
                          {formatDate(p.payment_date || p.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Disbursements Filed */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                  <span>Disbursements Filed ({disbursements.length})</span>
                </h3>
              </div>
              {disbursements.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No disbursements filed on this date.
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
                    {disbursements.map((d) => (
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

            {/* Documents Uploaded */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-teal-600" />
                  <span>Documents Uploaded ({documents.length})</span>
                </h3>
              </div>
              {documents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No documents uploaded on this date.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">File Name</TableHead>
                      <TableHead className="text-xs font-semibold">Category</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="text-xs font-medium text-slate-900 truncate max-w-[180px]">
                          {doc.original_name}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {doc.category}
                          </Badge>
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
                  <span>Transmittals ({transmittals.length})</span>
                </h3>
              </div>
              {transmittals.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No transmittals created on this date.
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
                    {transmittals.map((t) => (
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
