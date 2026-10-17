import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Printer,
  RefreshCw,
  X,
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
import { useSessionStore } from '@/lib/session';
import { useAgingReport } from '../api/useReports';
import {
  formatCurrency,
  formatCount,
  formatManilaDate,
  getTodayString,
  escapeCsvCell,
} from '../utils/formatters';
import { ReportToolbar, ReportToolbarGroup } from './ReportToolbar';
import { ReportTableContainer } from './ReportTableContainer';
import { ReportScopePrompt } from './ReportScopePrompt';
import {
  ReportLoadingState,
  ReportErrorState,
  ReportEmptyState,
} from './ReportStates';
import type { AgingInvoiceEntry } from '../api/types';

export interface AgingReportTabProps {
  onSelectInvoiceId?: (id: string) => void;
}

export type AgingBucketKey = 'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+';

interface AgingItemWithBucket extends AgingInvoiceEntry {
  bucket: string;
}

export function AgingReportTab({ onSelectInvoiceId }: AgingReportTabProps) {
  const activeEntity = useSessionStore((state) => state.activeEntity);
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

  const allEntries: AgingItemWithBucket[] = useMemo(() => {
    if (!agingData?.buckets) return [];
    const entries: AgingItemWithBucket[] = [];

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

  const filteredBalance = useMemo(() => {
    return filteredEntries.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  }, [filteredEntries]);

  // Early return if activeEntity is ALL or null (scope prompt)
  if (!activeEntity || activeEntity === 'ALL') {
    return <ReportScopePrompt />;
  }

  const handleBucketClick = (bucketKey: AgingBucketKey) => {
    if (selectedBucket === bucketKey) {
      setSelectedBucket('all');
    } else {
      setSelectedBucket(bucketKey);
    }
  };

  const handleResetFilters = () => {
    setSelectedBucket('all');
    setSearchQuery('');
  };

  const handleExportCsv = () => {
    if (filteredEntries.length === 0) return;

    const headers = [
      'Invoice #',
      'Client Name',
      'Due Date',
      'Days Overdue',
      'Aging Bracket',
      'Invoice Total',
      'Balance',
    ];

    const headerRow = headers.map(escapeCsvCell).join(',');

    const dataRows = filteredEntries.map((e) => [
      escapeCsvCell(e.invoiceNumber),
      escapeCsvCell(e.clientName),
      escapeCsvCell(e.dueDate ? e.dueDate.slice(0, 10) : ''),
      escapeCsvCell(e.daysOverdue),
      escapeCsvCell(e.bucket),
      escapeCsvCell(Number(e.total).toFixed(2)),
      escapeCsvCell(Number(e.balance).toFixed(2)),
    ].join(','));

    const csvContent = [headerRow, ...dataRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const entitySlug = activeEntity ? activeEntity.toLowerCase() : 'report';
    link.setAttribute(
      'download',
      `ar-aging-report-${entitySlug}-${getTodayString()}.csv`
    );
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
      {/* Print stylesheet */}
      <style>{`
        @media print {
          @page {
            margin: 12mm 12mm 12mm 12mm;
            size: auto;
          }
          thead {
            display: table-header-group !important;
          }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* 1. Context Toolbar (screen only) */}
      <ReportToolbar className="print:hidden">
        <ReportToolbarGroup align="left">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
            <span className="font-medium text-slate-500">As of:</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {formatManilaDate(getTodayString())}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              Entity: {activeEntity}
            </span>
          </div>
        </ReportToolbarGroup>

        <ReportToolbarGroup align="right">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredEntries.length === 0}
            className="text-xs h-8 gap-1.5 cursor-pointer"
            data-testid="aging-export-csv-button"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs h-8 gap-1.5 cursor-pointer"
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
            className="text-xs h-8 gap-1.5 cursor-pointer"
            data-testid="aging-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </ReportToolbarGroup>
      </ReportToolbar>

      {/* 2. Print Header (visible only during window.print()) */}
      <div className="hidden print:block mb-6 space-y-3">
        <div className="border-b border-slate-300 pb-3">
          <h1 className="text-xl font-bold text-slate-900">AR Aging Report</h1>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">Operating Entity:</span> {activeEntity}
            </div>
            <div>
              <span className="font-semibold text-slate-900">As of Date:</span>{' '}
              {formatManilaDate(getTodayString())}
            </div>
            <div>
              <span className="font-semibold text-slate-900">Active Bucket:</span>{' '}
              {selectedBucket === 'all'
                ? 'All Buckets'
                : selectedBucket === '90+'
                ? '90+ Days'
                : selectedBucket === 'current'
                ? 'Current'
                : `${selectedBucket} Days`}
            </div>
            <div>
              <span className="font-semibold text-slate-900">Invoices Included:</span>{' '}
              {filteredEntries.length} of {allEntries.length}
            </div>
            <div>
              <span className="font-semibold text-slate-900">Outstanding Balance:</span>{' '}
              {formatCurrency(summary.grandTotal)}
            </div>
            {filteredBalance !== summary.grandTotal && (
              <div>
                <span className="font-semibold text-slate-900">Filtered Balance:</span>{' '}
                {formatCurrency(filteredBalance)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Headline Outstanding Balance Summary Figure */}
      <div
        className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 cursor-pointer transition-colors hover:border-slate-300 print:hidden"
        onClick={() => setSelectedBucket('all')}
        data-testid="kpi-grand-total"
      >
        <div>
          <span className="text-xs sm:text-sm font-medium text-slate-500 block">
            Outstanding balance
          </span>
          <span className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mt-1 block tabular-nums">
            {formatCurrency(summary.grandTotal)}
          </span>
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          Total across all overdue and current brackets ({allEntries.length} {allEntries.length === 1 ? 'invoice' : 'invoices'})
        </div>
      </div>

      {/* 4. Accessible Bucket Selection Strip */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 print:hidden"
        role="group"
        aria-label="Aging bucket filter"
        data-testid="aging-bucket-strip"
      >
        {/* All Button */}
        <button
          type="button"
          onClick={() => setSelectedBucket('all')}
          aria-pressed={selectedBucket === 'all' ? 'true' : 'false'}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            selectedBucket === 'all'
              ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600/30 text-blue-950'
              : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
          data-testid="bucket-btn-all"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
            All
          </span>
          <span className="text-sm sm:text-base font-semibold text-slate-900 mt-1 block tabular-nums">
            {formatCurrency(summary.grandTotal)}
          </span>
          <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
            {formatCount(allEntries.length)} {allEntries.length === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* Current Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('current')}
          aria-pressed={selectedBucket === 'current' ? 'true' : 'false'}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            selectedBucket === 'current'
              ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600/30 text-blue-950'
              : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
          data-testid="kpi-current"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
            Current
          </span>
          <span className="text-sm sm:text-base font-semibold text-slate-900 mt-1 block tabular-nums">
            {formatCurrency(summary.current)}
          </span>
          <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
            {formatCount(agingData?.buckets?.current?.count ?? 0)}{' '}
            {(agingData?.buckets?.current?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 1–30 Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('1-30')}
          aria-pressed={selectedBucket === '1-30' ? 'true' : 'false'}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            selectedBucket === '1-30'
              ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600/30 text-blue-950'
              : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
          data-testid="kpi-1-30"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 block">
            1–30 Days
          </span>
          <span className="text-sm sm:text-base font-semibold text-slate-900 mt-1 block tabular-nums">
            {formatCurrency(summary['1-30'])}
          </span>
          <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
            {formatCount(agingData?.buckets?.['1-30']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['1-30']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 31–60 Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('31-60')}
          aria-pressed={selectedBucket === '31-60' ? 'true' : 'false'}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            selectedBucket === '31-60'
              ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600/30 text-blue-950'
              : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
          data-testid="kpi-31-60"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-orange-700 block">
            31–60 Days
          </span>
          <span className="text-sm sm:text-base font-semibold text-slate-900 mt-1 block tabular-nums">
            {formatCurrency(summary['31-60'])}
          </span>
          <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
            {formatCount(agingData?.buckets?.['31-60']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['31-60']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 61–90 Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('61-90')}
          aria-pressed={selectedBucket === '61-90' ? 'true' : 'false'}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            selectedBucket === '61-90'
              ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600/30 text-blue-950'
              : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
          data-testid="kpi-61-90"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 block">
            61–90 Days
          </span>
          <span className="text-sm sm:text-base font-semibold text-slate-900 mt-1 block tabular-nums">
            {formatCurrency(summary['61-90'])}
          </span>
          <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
            {formatCount(agingData?.buckets?.['61-90']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['61-90']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 90+ Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('90+')}
          aria-pressed={selectedBucket === '90+' ? 'true' : 'false'}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            selectedBucket === '90+'
              ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600/30 text-blue-950'
              : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
          data-testid="kpi-90-plus"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 block">
            90+ Days
          </span>
          <span className="text-sm sm:text-base font-semibold text-slate-900 mt-1 block tabular-nums">
            {formatCurrency(summary['90+'])}
          </span>
          <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
            {formatCount(agingData?.buckets?.['90+']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['90+']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>
      </div>

      {/* 5. Search Bar & Distinct Result Labeling */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
        <div className="relative max-w-sm flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client or invoice number..."
            className="pl-9 pr-8 h-9 text-xs sm:text-sm bg-white"
            data-testid="aging-search-input"
            aria-label="Search invoices by client name or invoice number"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          className="text-xs sm:text-sm text-slate-600 flex flex-wrap items-center gap-1.5"
          data-testid="aging-filter-summary"
        >
          <span>
            Showing <strong className="font-semibold text-slate-900 tabular-nums">{filteredEntries.length}</strong> of{' '}
            <strong className="font-semibold text-slate-900 tabular-nums">{allEntries.length}</strong> invoices
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Filtered balance:{' '}
            <strong className="font-semibold text-slate-900 tabular-nums">
              {formatCurrency(filteredBalance)}
            </strong>
          </span>
          {selectedBucket !== 'all' && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-blue-700 font-medium">
                ({selectedBucket === '90+' ? '90+ Days' : selectedBucket === 'current' ? 'Current' : `${selectedBucket} Days`} bucket)
              </span>
            </>
          )}
        </div>
      </div>

      {/* 6. Main Content: Loading, Error, Empty, or Table */}
      {isLoading ? (
        <ReportLoadingState dataTestId="aging-loading" type="full" rows={5} columns={6} />
      ) : error ? (
        <ReportErrorState
          dataTestId="aging-error"
          title="Unable to load aging report"
          message={error instanceof Error ? error.message : 'Please check your connection and try again.'}
          onRetry={() => refetch()}
          staleDataNotice={Boolean(agingData)}
        />
      ) : filteredEntries.length === 0 ? (
        allEntries.length === 0 ? (
          <ReportEmptyState
            dataTestId="empty-aging-report"
            title="No outstanding invoices"
            description={`There are currently no open or overdue accounts receivable for ${activeEntity}.`}
          />
        ) : (
          <ReportEmptyState
            dataTestId="empty-aging-report"
            title="No invoices match these filters."
            description="No invoices were found matching the selected aging bucket or search query."
            onReset={handleResetFilters}
            resetLabel="Clear filters"
          />
        )
      ) : (
        <ReportTableContainer minWidth="min-w-[800px]" ariaLabel="Accounts receivable aging invoices">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-b border-slate-200">
                <TableHead className="text-xs font-semibold text-slate-700 text-left py-3 px-4">
                  Invoice #
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-left py-3 px-4">
                  Client Name
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-left py-3 px-4">
                  Due Date
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right py-3 px-4">
                  Days Overdue
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-left py-3 px-4">
                  Aging Bracket
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right py-3 px-4">
                  Invoice Total
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right py-3 px-4">
                  Balance
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {filteredEntries.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  onClick={() => onSelectInvoiceId?.(row.id)}
                  tabIndex={onSelectInvoiceId ? 0 : undefined}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onSelectInvoiceId) {
                      e.preventDefault();
                      onSelectInvoiceId(row.id);
                    }
                  }}
                  data-testid={`aging-row-${row.id}`}
                >
                  <TableCell className="font-semibold text-xs text-slate-900 py-3 px-4 text-left">
                    {row.invoiceNumber}
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 py-3 px-4 text-left font-medium">
                    {row.clientName}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 py-3 px-4 text-left tabular-nums">
                    {formatManilaDate(row.dueDate)}
                  </TableCell>
                  <TableCell className="text-xs py-3 px-4 text-right tabular-nums font-medium">
                    <span
                      className={
                        row.daysOverdue > 60
                          ? 'text-rose-700 font-semibold'
                          : row.daysOverdue > 30
                          ? 'text-orange-700 font-semibold'
                          : row.daysOverdue > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-600'
                      }
                    >
                      {row.daysOverdue} {row.daysOverdue === 1 ? 'day' : 'days'}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-left">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium ${
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
                  <TableCell className="text-xs text-slate-700 text-right py-3 px-4 tabular-nums">
                    {formatCurrency(row.total)}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-slate-900 text-right py-3 px-4 tabular-nums">
                    {formatCurrency(row.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTableContainer>
      )}
    </div>
  );
}
