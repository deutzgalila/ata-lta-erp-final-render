import { useState, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
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
import { useAgingReport } from '../api/useReports';
import { formatCurrency, getTodayString } from '../utils/formatters';
import type { AgingInvoiceEntry } from '../api/types';

export interface AgingReportTabProps {
  onSelectInvoiceId?: (id: string) => void;
}

type AgingBucketKey = 'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+';

export function AgingReportTab({ onSelectInvoiceId }: AgingReportTabProps) {
  const { data: agingData, isLoading, error, refetch, isRefetching } = useAgingReport();
  const [selectedBucket, setSelectedBucket] = useState<AgingBucketKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const summary = agingData?.summary || {
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    grandTotal: 0,
  };

  const allEntries: Array<AgingInvoiceEntry & { bucket: string }> = useMemo(() => {
    if (!agingData?.buckets) return [];
    const entries: Array<AgingInvoiceEntry & { bucket: string }> = [];

    const append = (list: AgingInvoiceEntry[] | undefined, bucket: string) => {
      for (const item of list || []) {
        entries.push({ ...item, bucket });
      }
    };

    append(agingData.buckets.current?.invoices, 'Current');
    append(agingData.buckets['1-30']?.invoices, '1–30 Days');
    append(agingData.buckets['31-60']?.invoices, '31–60 Days');
    append(agingData.buckets['61-90']?.invoices, '61–90 Days');
    append(agingData.buckets['90+']?.invoices, '90+ Days');

    return entries;
  }, [agingData]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((item) => {
      // Bucket filter
      if (selectedBucket === 'current' && item.bucket !== 'Current') return false;
      if (selectedBucket === '1-30' && item.bucket !== '1–30 Days') return false;
      if (selectedBucket === '31-60' && item.bucket !== '31–60 Days') return false;
      if (selectedBucket === '61-90' && item.bucket !== '61–90 Days') return false;
      if (selectedBucket === '90+' && item.bucket !== '90+ Days') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesInv = item.invoiceNumber.toLowerCase().includes(q);
        const matchesClient = item.clientName.toLowerCase().includes(q);
        if (!matchesInv && !matchesClient) return false;
      }

      return true;
    });
  }, [allEntries, selectedBucket, searchQuery]);

  const handleExportCsv = () => {
    const headers = [
      'Invoice #',
      'Client Name',
      'Due Date',
      'Days Overdue',
      'Aging Bracket',
      'Total Amount',
      'Outstanding Balance',
    ];

    const rows = filteredEntries.map((e) => [
      `"${e.invoiceNumber.replace(/"/g, '""')}"`,
      `"${e.clientName.replace(/"/g, '""')}"`,
      `"${(e.dueDate || '').slice(0, 10)}"`,
      e.daysOverdue,
      `"${e.bucket}"`,
      e.total.toFixed(2),
      e.balance.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ar-aging-report-${getTodayString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" data-testid="aging-report-tab">
      {/* 1. Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <span>Accounts Receivable Aging Report</span>
          </h2>
          <p className="text-xs text-slate-500">
            Aging analysis of outstanding balances categorized across 5 overdue time brackets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredEntries.length === 0}
            className="text-xs gap-1.5 cursor-pointer"
            data-testid="aging-export-csv-button"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs gap-1.5 cursor-pointer"
            data-testid="aging-print-button"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs gap-1.5 cursor-pointer"
            data-testid="aging-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Printable Heading (shown only during print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          Accounts Receivable Aging Report
        </h1>
        <p className="text-xs text-slate-600">Generated on {getTodayString()}</p>
      </div>

      {/* 2. Summary KPI Cards Grid (Click to filter bucket) */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 print:grid-cols-3"
        data-testid="aging-kpi-grid"
      >
        {/* Current */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === 'current' ? 'all' : 'current')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            selectedBucket === 'current'
              ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          data-testid="kpi-current"
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
            Current (0 Days)
          </span>
          <span className="text-base font-bold text-slate-900 mt-1 block">
            {formatCurrency(summary.current)}
          </span>
          <span className="text-[10px] text-slate-400">Not yet overdue</span>
        </div>

        {/* 1-30 Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '1-30' ? 'all' : '1-30')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            selectedBucket === '1-30'
              ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          data-testid="kpi-1-30"
        >
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide block">
            1–30 Days
          </span>
          <span className="text-base font-bold text-amber-700 mt-1 block">
            {formatCurrency(summary['1-30'])}
          </span>
          <span className="text-[10px] text-slate-400">Early overdue</span>
        </div>

        {/* 31-60 Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '31-60' ? 'all' : '31-60')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            selectedBucket === '31-60'
              ? 'bg-orange-50/60 border-orange-300 ring-2 ring-orange-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          data-testid="kpi-31-60"
        >
          <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wide block">
            31–60 Days
          </span>
          <span className="text-base font-bold text-orange-700 mt-1 block">
            {formatCurrency(summary['31-60'])}
          </span>
          <span className="text-[10px] text-slate-400">Aging notice</span>
        </div>

        {/* 61-90 Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '61-90' ? 'all' : '61-90')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            selectedBucket === '61-90'
              ? 'bg-rose-50/60 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          data-testid="kpi-61-90"
        >
          <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wide block">
            61–90 Days
          </span>
          <span className="text-base font-bold text-rose-700 mt-1 block">
            {formatCurrency(summary['61-90'])}
          </span>
          <span className="text-[10px] text-slate-400">Urgent follow-up</span>
        </div>

        {/* 90+ Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '90+' ? 'all' : '90+')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            selectedBucket === '90+'
              ? 'bg-purple-50/60 border-purple-300 ring-2 ring-purple-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          data-testid="kpi-90-plus"
        >
          <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide block">
            90+ Days
          </span>
          <span className="text-base font-bold text-purple-800 mt-1 block">
            {formatCurrency(summary['90+'])}
          </span>
          <span className="text-[10px] text-slate-400">Delinquent account</span>
        </div>

        {/* Grand Total */}
        <div
          onClick={() => setSelectedBucket('all')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            selectedBucket === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
          }`}
          data-testid="kpi-grand-total"
        >
          <span
            className={`text-[11px] font-bold uppercase tracking-wide block ${
              selectedBucket === 'all' ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            Total Receivables
          </span>
          <span className="text-base font-black mt-1 block">
            {formatCurrency(summary.grandTotal)}
          </span>
          <span
            className={`text-[10px] ${
              selectedBucket === 'all' ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            All brackets combined
          </span>
        </div>
      </div>

      {/* 3. Search and Table Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
        <div className="relative max-w-sm flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client or invoice number..."
            className="pl-9 h-9 text-xs"
            data-testid="aging-search-input"
          />
        </div>

        <div className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-800">{filteredEntries.length}</span>{' '}
          outstanding invoices
          {selectedBucket !== 'all' && (
            <span className="ml-1 text-blue-600 font-medium">({selectedBucket} bucket)</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div
          className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200"
          data-testid="aging-loading"
        >
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-xs">Loading accounts receivable aging data...</p>
        </div>
      ) : error ? (
        <div
          className="p-8 text-center bg-white rounded-xl border border-rose-200 space-y-3"
          data-testid="aging-error"
        >
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">Unable to load aging report</h3>
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
      ) : filteredEntries.length === 0 ? (
        <div
          className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-2"
          data-testid="empty-aging-report"
        >
          <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">No overdue invoices found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All customer accounts in this bucket have zero outstanding balance.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-xs font-semibold text-slate-700">Invoice #</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Client Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Due Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Days Overdue</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Aging Bracket</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right">
                  Total Amount
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right">
                  Outstanding Balance
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => onSelectInvoiceId && onSelectInvoiceId(row.id)}
                  data-testid={`aging-row-${row.id}`}
                >
                  <TableCell className="font-semibold text-xs text-slate-900 py-3 font-mono">
                    {row.invoiceNumber}
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 py-3 font-medium">
                    {row.clientName}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 py-3 font-mono">
                    {row.dueDate?.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-xs py-3 font-bold">
                    <span
                      className={
                        row.daysOverdue > 60
                          ? 'text-rose-600'
                          : row.daysOverdue > 30
                          ? 'text-orange-600'
                          : row.daysOverdue > 0
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }
                    >
                      {row.daysOverdue} days
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${
                        row.bucket === 'Current'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : row.bucket === '1–30 Days'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : row.bucket === '31–60 Days'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : row.bucket === '61–90 Days'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {row.bucket}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-600 text-right py-3">
                    {formatCurrency(row.total)}
                  </TableCell>
                  <TableCell className="text-xs font-mono font-bold text-amber-600 text-right py-3">
                    {formatCurrency(row.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
