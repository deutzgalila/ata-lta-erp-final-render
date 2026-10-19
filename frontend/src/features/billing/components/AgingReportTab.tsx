import { useState, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  Eye,
  FileSpreadsheet,
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
import { useAgingReport } from '../api/useAgingReport';
import { formatCurrency } from '../utils/formatters';
import type { AgingEntry } from '../api/types';

export interface AgingReportTabProps {
  onSelectInvoiceId?: (id: string) => void;
}

type AgingBucketKey = 'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+';

export function AgingReportTab({ onSelectInvoiceId }: AgingReportTabProps) {
  const { data: agingData, isLoading, refetch } = useAgingReport();
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

  const allEntries: Array<AgingEntry & { bucket: string }> = useMemo(() => {
    if (!agingData?.details) return [];
    const entries: Array<AgingEntry & { bucket: string }> = [];

    const append = (list: AgingEntry[] | undefined, bucket: string) => {
      for (const item of list || []) {
        entries.push({ ...item, bucket });
      }
    };

    append(agingData.details.current?.invoices, 'Current');
    append(agingData.details['1-30']?.invoices, '1–30 Days');
    append(agingData.details['31-60']?.invoices, '31–60 Days');
    append(agingData.details['61-90']?.invoices, '61–90 Days');
    append(agingData.details['90+']?.invoices, '90+ Days');

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

  return (
    <div className="space-y-6" data-testid="aging-report-tab">
      {/* 1. Header & Summary Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-[#0A0A0A] pb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-[#0A0A0A] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#0A0A0A]" />
            <span>Accounts Receivable Aging Report</span>
          </h2>
          <p className="text-xs text-[#4A4945] pt-0.5">
            Real-time aging breakdown of outstanding receivables grouped by overdue aging brackets.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="text-xs font-mono font-semibold h-8 px-3 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] text-[#0A0A0A] transition-colors self-start sm:self-auto cursor-pointer shadow-none"
        >
          Refresh Report
        </Button>
      </div>

      {/* Summary KPI Cards Grid */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5"
        data-testid="aging-kpi-grid"
      >
        {/* Current */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === 'current' ? 'all' : 'current')}
          className={`p-3 rounded-none border transition-colors cursor-pointer flex flex-col justify-between ${
            selectedBucket === 'current'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC]'
          }`}
          data-testid="kpi-current"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === 'current' ? 'text-[#EAE8E3]' : 'text-[#4A4945]'}`}>
            Current (0 Days)
          </span>
          <span className={`font-mono text-base font-bold mt-1 block tabular-nums ${selectedBucket === 'current' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary.current)}
          </span>
          <span className={`text-xs mt-0.5 block ${selectedBucket === 'current' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            Not yet overdue
          </span>
        </div>

        {/* 1-30 Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '1-30' ? 'all' : '1-30')}
          className={`p-3 rounded-none border transition-colors cursor-pointer flex flex-col justify-between ${
            selectedBucket === '1-30'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC]'
          }`}
          data-testid="kpi-1-30">
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '1-30' ? 'text-[#EAE8E3]' : 'text-[#734800]'}`}>
            1–30 Days
          </span>
          <span className={`font-mono text-base font-bold mt-1 block tabular-nums ${selectedBucket === '1-30' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['1-30'])}
          </span>
          <span className={`text-xs mt-0.5 block ${selectedBucket === '1-30' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            Early overdue
          </span>
        </div>

        {/* 31-60 Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '31-60' ? 'all' : '31-60')}
          className={`p-3 rounded-none border transition-colors cursor-pointer flex flex-col justify-between ${
            selectedBucket === '31-60'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC]'
          }`}
          data-testid="kpi-31-60"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '31-60' ? 'text-[#EAE8E3]' : 'text-[#734800]'}`}>
            31–60 Days
          </span>
          <span className={`font-mono text-base font-bold mt-1 block tabular-nums ${selectedBucket === '31-60' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['31-60'])}
          </span>
          <span className={`text-xs mt-0.5 block ${selectedBucket === '31-60' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            Aging notice
          </span>
        </div>

        {/* 61-90 Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '61-90' ? 'all' : '61-90')}
          className={`p-3 rounded-none border transition-colors cursor-pointer flex flex-col justify-between ${
            selectedBucket === '61-90'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC]'
          }`}
          data-testid="kpi-61-90"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '61-90' ? 'text-[#EAE8E3]' : 'text-[#E61919]'}`}>
            61–90 Days
          </span>
          <span className={`font-mono text-base font-bold mt-1 block tabular-nums ${selectedBucket === '61-90' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['61-90'])}
          </span>
          <span className={`text-xs mt-0.5 block ${selectedBucket === '61-90' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            Urgent follow-up
          </span>
        </div>

        {/* 90+ Days */}
        <div
          onClick={() => setSelectedBucket(selectedBucket === '90+' ? 'all' : '90+')}
          className={`p-3 rounded-none border transition-colors cursor-pointer flex flex-col justify-between ${
            selectedBucket === '90+'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC]'
          }`}
          data-testid="kpi-90-plus"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === '90+' ? 'text-[#EAE8E3]' : 'text-[#A81212]'}`}>
            90+ Days
          </span>
          <span className={`font-mono text-base font-bold mt-1 block tabular-nums ${selectedBucket === '90+' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary['90+'])}
          </span>
          <span className={`text-xs mt-0.5 block ${selectedBucket === '90+' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            Delinquent account
          </span>
        </div>

        {/* Grand Total */}
        <div
          onClick={() => setSelectedBucket('all')}
          className={`p-3 rounded-none border transition-colors cursor-pointer flex flex-col justify-between ${
            selectedBucket === 'all'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] border-2 border-[#0A0A0A] shadow-[inset_0_3px_0_0_#E61919]'
              : 'bg-[#FAF9F5] border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#E4E2DC]'
          }`}
          data-testid="kpi-grand-total"
        >
          <span className={`font-mono text-xs font-semibold uppercase tracking-wider block ${selectedBucket === 'all' ? 'text-[#EAE8E3]' : 'text-[#4A4945]'}`}>
            Total Receivables
          </span>
          <span className={`font-mono text-base font-bold mt-1 block tabular-nums ${selectedBucket === 'all' ? 'text-[#FAF9F5]' : 'text-[#0A0A0A]'}`}>
            {formatCurrency(summary.grandTotal)}
          </span>
          <span className={`text-xs mt-0.5 block ${selectedBucket === 'all' ? 'text-[#C8C5BC]' : 'text-[#4A4945]'}`}>
            All brackets combined
          </span>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#4A4945] pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client or invoice number..."
            className="pl-9 h-9 text-xs font-sans rounded-none border border-[#0A0A0A] bg-white focus-visible:ring-[#0A0A0A]"
            data-testid="aging-search-input"
          />
        </div>

        <div className="font-mono text-xs text-[#4A4945]">
          Showing <span className="font-bold text-[#0A0A0A] tabular-nums">{filteredEntries.length}</span>{' '}
          outstanding invoices
          {selectedBucket !== 'all' && (
            <span className="ml-1 text-[#0A0A0A] font-semibold">({selectedBucket} bucket)</span>
          )}
        </div>
      </div>

      {/* 3. Table of Aging Invoices */}
      {isLoading ? (
        <div className="p-12 text-center text-[#4A4945] bg-[#FAF9F5] rounded-none border border-[#0A0A0A]">
          <div className="inline-block animate-spin h-7 w-7 border-2 border-[#0A0A0A] border-t-transparent mb-2"></div>
          <p className="font-mono text-xs uppercase tracking-wider">Loading aging report...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div
          className="p-12 text-center bg-[#FAF9F5] rounded-none border-2 border-dashed border-[#0A0A0A] space-y-2"
          data-testid="empty-aging-report"
        >
          <FileSpreadsheet className="w-10 h-10 text-[#4A4945] mx-auto" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-tight text-[#0A0A0A]">
            No overdue invoices found
          </h3>
          <p className="text-xs text-[#4A4945] max-w-sm mx-auto">
            All customer accounts in this bucket have zero outstanding balance.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-none border border-[#0A0A0A] bg-[#FAF9F5] shadow-none">
          <Table>
            <TableHeader className="bg-[#EAE8E3] border-b border-[#0A0A0A]">
              <TableRow>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">Invoice #</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">Client Name</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">Due Date</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">Days Overdue</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">Aging Bracket</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A] text-right">
                  Total Amount
                </TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A] text-right">
                  Outstanding Balance
                </TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A] text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#C8C5BC]">
              {filteredEntries.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-[#E4E2DC]/60 transition-colors cursor-pointer"
                  onClick={() => onSelectInvoiceId && onSelectInvoiceId(row.id)}
                  data-testid={`aging-row-${row.id}`}
                >
                  <TableCell className="font-mono font-semibold text-xs text-[#0A0A0A] py-3">
                    {row.invoiceNumber}
                  </TableCell>
                  <TableCell className="text-xs text-[#0A0A0A] py-3 font-medium">
                    {row.clientName}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#4A4945] py-3 tabular-nums">
                    {row.dueDate?.slice(0, 10)}
                  </TableCell>
                  <TableCell className="font-mono text-xs py-3 tabular-nums font-semibold">
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
                      {row.daysOverdue} days
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
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
                  <TableCell className="font-mono text-xs text-[#4A4945] text-right py-3 tabular-nums">
                    {formatCurrency(row.total)}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-bold text-[#0A0A0A] text-right py-3 tabular-nums">
                    {formatCurrency(row.balance)}
                  </TableCell>
                  <TableCell className="text-right py-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSelectInvoiceId && onSelectInvoiceId(row.id)}
                      className="h-7 w-7 text-[#4A4945] hover:text-[#0A0A0A] hover:bg-[#EAE8E3] rounded-none cursor-pointer"
                      title="View Invoice Details"
                      data-testid={`aging-view-btn-${row.id}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
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
