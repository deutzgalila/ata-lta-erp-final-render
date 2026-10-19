import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
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
          <div className="flex items-center gap-2 font-mono text-xs sm:text-sm text-[#0A0A0A]">
            <span className="font-semibold text-[#4A4945]">As of:</span>
            <span className="font-bold text-[#0A0A0A] tabular-nums">
              {formatManilaDate(getTodayString())}
            </span>
            <span className="text-[#C8C5BC]">·</span>
            <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-none bg-[#FAF9F5] text-[#0A0A0A] border border-[#0A0A0A]">
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
            className="text-xs font-mono font-semibold h-8 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] text-[#0A0A0A] transition-colors cursor-pointer gap-1.5 shadow-none"
            data-testid="aging-export-csv-button"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs font-mono font-semibold h-8 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] text-[#0A0A0A] transition-colors cursor-pointer gap-1.5 shadow-none"
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
            className="text-xs font-mono font-semibold h-8 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] text-[#0A0A0A] transition-colors cursor-pointer gap-1.5 shadow-none"
            data-testid="aging-refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </ReportToolbarGroup>
      </ReportToolbar>

      {/* 2. Print Header (visible only during window.print()) */}
      <div className="hidden print:block mb-6 space-y-3 font-mono">
        <div className="border-b-2 border-[#0A0A0A] pb-3">
          <h1 className="text-xl font-bold uppercase tracking-tight text-[#0A0A0A]">
            AR Aging Report
          </h1>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs text-[#0A0A0A]">
            <div>
              <span className="font-semibold text-[#0A0A0A]">Operating Entity:</span> {activeEntity}
            </div>
            <div>
              <span className="font-semibold text-[#0A0A0A]">As of Date:</span>{' '}
              {formatManilaDate(getTodayString())}
            </div>
            <div>
              <span className="font-semibold text-[#0A0A0A]">Active Bucket:</span>{' '}
              {selectedBucket === 'all'
                ? 'All Buckets'
                : selectedBucket === '90+'
                ? '90+ Days'
                : selectedBucket === 'current'
                ? 'Current'
                : `${selectedBucket} Days`}
            </div>
            <div>
              <span className="font-semibold text-[#0A0A0A]">Invoices Included:</span>{' '}
              {filteredEntries.length} of {allEntries.length}
            </div>
            <div>
              <span className="font-semibold text-[#0A0A0A]">Outstanding Balance:</span>{' '}
              {formatCurrency(summary.grandTotal)}
            </div>
            {filteredBalance !== summary.grandTotal && (
              <div>
                <span className="font-semibold text-[#0A0A0A]">Filtered Balance:</span>{' '}
                {formatCurrency(filteredBalance)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Headline Outstanding Balance Summary Figure */}
      <div
        className="bg-[#FAF9F5] rounded-none border-2 border-[#0A0A0A] p-4 sm:p-5 shadow-none flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 cursor-pointer transition-colors hover:bg-[#E4E2DC]/50 print:hidden"
        onClick={() => setSelectedBucket('all')}
        data-testid="kpi-grand-total"
      >
        <div>
          <span className="font-mono text-xs uppercase tracking-wider font-semibold text-[#4A4945] block">
            Outstanding balance
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-bold text-[#0A0A0A] tracking-tight mt-1 block tabular-nums">
            {formatCurrency(summary.grandTotal)}
          </span>
        </div>
        <div className="text-xs text-[#4A4945] tabular-nums">
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
          className={`p-3 rounded-none border transition-colors text-left flex flex-col justify-between cursor-pointer focus:outline-none ${
            selectedBucket === 'all'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919] focus:ring-2 focus:ring-[#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC] focus:ring-2 focus:ring-[#0A0A0A]'
          }`}
          data-testid="bucket-btn-all"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === 'all' ? 'text-[#EAE8E3]' : 'text-[#4A4945]'}`}>
            All
          </span>
          <span className={`font-mono text-sm sm:text-base font-bold mt-1 block tabular-nums ${selectedBucket === 'all' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary.grandTotal)}
          </span>
          <span className={`text-xs mt-0.5 block tabular-nums ${selectedBucket === 'all' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            {formatCount(allEntries.length)} {allEntries.length === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* Current Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('current')}
          aria-pressed={selectedBucket === 'current' ? 'true' : 'false'}
          className={`p-3 rounded-none border transition-colors text-left flex flex-col justify-between cursor-pointer focus:outline-none ${
            selectedBucket === 'current'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919] focus:ring-2 focus:ring-[#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC] focus:ring-2 focus:ring-[#0A0A0A]'
          }`}
          data-testid="kpi-current"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === 'current' ? 'text-[#EAE8E3]' : 'text-[#4A4945]'}`}>
            Current
          </span>
          <span className={`font-mono text-sm sm:text-base font-bold mt-1 block tabular-nums ${selectedBucket === 'current' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary.current)}
          </span>
          <span className={`text-xs mt-0.5 block tabular-nums ${selectedBucket === 'current' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            {formatCount(agingData?.buckets?.current?.count ?? 0)}{' '}
            {(agingData?.buckets?.current?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 1–30 Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('1-30')}
          aria-pressed={selectedBucket === '1-30' ? 'true' : 'false'}
          className={`p-3 rounded-none border transition-colors text-left flex flex-col justify-between cursor-pointer focus:outline-none ${
            selectedBucket === '1-30'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919] focus:ring-2 focus:ring-[#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC] focus:ring-2 focus:ring-[#0A0A0A]'
          }`}
          data-testid="kpi-1-30"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '1-30' ? 'text-[#EAE8E3]' : 'text-[#734800]'}`}>
            1–30 Days
          </span>
          <span className={`font-mono text-sm sm:text-base font-bold mt-1 block tabular-nums ${selectedBucket === '1-30' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['1-30'])}
          </span>
          <span className={`text-xs mt-0.5 block tabular-nums ${selectedBucket === '1-30' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            {formatCount(agingData?.buckets?.['1-30']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['1-30']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 31–60 Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('31-60')}
          aria-pressed={selectedBucket === '31-60' ? 'true' : 'false'}
          className={`p-3 rounded-none border transition-colors text-left flex flex-col justify-between cursor-pointer focus:outline-none ${
            selectedBucket === '31-60'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919] focus:ring-2 focus:ring-[#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC] focus:ring-2 focus:ring-[#0A0A0A]'
          }`}
          data-testid="kpi-31-60"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '31-60' ? 'text-[#EAE8E3]' : 'text-[#734800]'}`}>
            31–60 Days
          </span>
          <span className={`font-mono text-sm sm:text-base font-bold mt-1 block tabular-nums ${selectedBucket === '31-60' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['31-60'])}
          </span>
          <span className={`text-xs mt-0.5 block tabular-nums ${selectedBucket === '31-60' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            {formatCount(agingData?.buckets?.['31-60']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['31-60']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 61–90 Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('61-90')}
          aria-pressed={selectedBucket === '61-90' ? 'true' : 'false'}
          className={`p-3 rounded-none border transition-colors text-left flex flex-col justify-between cursor-pointer focus:outline-none ${
            selectedBucket === '61-90'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919] focus:ring-2 focus:ring-[#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC] focus:ring-2 focus:ring-[#0A0A0A]'
          }`}
          data-testid="kpi-61-90"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '61-90' ? 'text-[#EAE8E3]' : 'text-[#E61919]'}`}>
            61–90 Days
          </span>
          <span className={`font-mono text-sm sm:text-base font-bold mt-1 block tabular-nums ${selectedBucket === '61-90' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['61-90'])}
          </span>
          <span className={`text-xs mt-0.5 block tabular-nums ${selectedBucket === '61-90' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            {formatCount(agingData?.buckets?.['61-90']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['61-90']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>

        {/* 90+ Days Button */}
        <button
          type="button"
          onClick={() => handleBucketClick('90+')}
          aria-pressed={selectedBucket === '90+' ? 'true' : 'false'}
          className={`p-3 rounded-none border transition-colors text-left flex flex-col justify-between cursor-pointer focus:outline-none ${
            selectedBucket === '90+'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919] focus:ring-2 focus:ring-[#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC] focus:ring-2 focus:ring-[#0A0A0A]'
          }`}
          data-testid="kpi-90-plus"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '90+' ? 'text-[#EAE8E3]' : 'text-[#A81212]'}`}>
            90+ Days
          </span>
          <span className={`font-mono text-sm sm:text-base font-bold mt-1 block tabular-nums ${selectedBucket === '90+' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['90+'])}
          </span>
          <span className={`text-xs mt-0.5 block tabular-nums ${selectedBucket === '90+' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            {formatCount(agingData?.buckets?.['90+']?.count ?? 0)}{' '}
            {(agingData?.buckets?.['90+']?.count ?? 0) === 1 ? 'invoice' : 'invoices'}
          </span>
        </button>
      </div>

      {/* 5. Search Bar & Distinct Result Labeling */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
        <div className="relative max-w-sm flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#4A4945] pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client or invoice number..."
            className="pl-9 pr-8 h-9 text-xs sm:text-sm bg-white rounded-none border border-[#0A0A0A] focus-visible:ring-[#0A0A0A]"
            data-testid="aging-search-input"
            aria-label="Search invoices by client name or invoice number"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-2.5 text-[#4A4945] hover:text-[#0A0A0A] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          className="text-xs sm:text-sm text-[#4A4945] flex flex-wrap items-center gap-1.5"
          data-testid="aging-filter-summary"
        >
          <span>
            Showing <strong className="font-mono font-bold text-[#0A0A0A] tabular-nums">{filteredEntries.length}</strong> of{' '}
            <strong className="font-mono font-bold text-[#0A0A0A] tabular-nums">{allEntries.length}</strong> invoices
          </span>
          <span aria-hidden="true" className="text-[#C8C5BC]">·</span>
          <span>
            Filtered balance:{' '}
            <strong className="font-mono font-bold text-[#0A0A0A] tabular-nums">
              {formatCurrency(filteredBalance)}
            </strong>
          </span>
          {selectedBucket !== 'all' && (
            <>
              <span aria-hidden="true" className="text-[#C8C5BC]">·</span>
              <span className="font-mono font-semibold text-[#0A0A0A]">
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
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Days Overdue</TableHead>
                <TableHead>Aging Bracket</TableHead>
                <TableHead className="text-right">Invoice Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-[#E4E2DC]/60 transition-colors cursor-pointer"
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
                  <TableCell className="font-mono font-semibold text-xs text-[#0A0A0A] py-3 px-4 text-left">
                    {row.invoiceNumber}
                  </TableCell>
                  <TableCell className="text-xs text-[#0A0A0A] py-3 px-4 text-left font-medium">
                    {row.clientName}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#4A4945] py-3 px-4 text-left tabular-nums">
                    {formatManilaDate(row.dueDate)}
                  </TableCell>
                  <TableCell className="text-xs py-3 px-4 text-right tabular-nums font-mono font-semibold">
                    <span
                      className={
                        row.daysOverdue > 60
                          ? 'text-[#E61919] font-bold'
                          : row.daysOverdue > 30
                          ? 'text-[#734800] font-bold'
                          : row.daysOverdue > 0
                          ? 'text-[#734800] font-semibold'
                          : 'text-[#4A4945]'
                      }
                    >
                      {row.daysOverdue} {row.daysOverdue === 1 ? 'day' : 'days'}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-left">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-none border font-mono text-xs font-semibold tabular-nums ${
                        row.bucket === 'Current'
                          ? 'bg-[#E6F2E8] text-[#0F5223] border-[#1B7A37]'
                          : row.bucket === '1–30 Days'
                          ? 'bg-[#FDF3D7] text-[#734800] border-[#B87500]'
                          : row.bucket === '31–60 Days'
                          ? 'bg-[#FDF3D7] text-[#734800] border-[#B87500]'
                          : row.bucket === '61–90 Days'
                          ? 'bg-[#FCE8E8] text-[#A81212] border-[#E61919]'
                          : 'bg-[#FCE8E8] text-[#A81212] border-[#E61919]'
                      }`}
                    >
                      {row.bucket}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#4A4945] text-right py-3 px-4 tabular-nums">
                    {formatCurrency(row.total)}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-bold text-[#0A0A0A] text-right py-3 px-4 tabular-nums">
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
