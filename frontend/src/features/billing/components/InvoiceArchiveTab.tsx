import { useState } from 'react';
import {
  Archive,
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Eye,
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
import { useInvoices } from '../api/useInvoices';
import { restoreInvoiceAction } from '../api/useBillingMutations';
import { useDebounce } from '../hooks/useDebounce';
import { usePermission } from '@/lib/permissions';
import { formatCurrency, getStatusBadgeVariant } from '../utils/formatters';
import type { Invoice } from '../api/types';

export interface InvoiceArchiveTabProps {
  onSelectInvoice?: (invoice: Invoice) => void;
}

export function InvoiceArchiveTab({ onSelectInvoice }: InvoiceArchiveTabProps) {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canEdit = usePermission('billing:edit');

  const { data: invoicesResponse, isLoading, refetch } = useInvoices({
    archived: true,
    search: debouncedSearch || undefined,
    page,
    limit: 25,
  });

  const invoices = invoicesResponse?.data || [];
  const totalCount = invoicesResponse?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length && invoices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRestoreSingle = async (inv: Invoice) => {
    try {
      await restoreInvoiceAction(inv.id, inv.invoice_number, inv.entity_id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(inv.id);
        return next;
      });
      refetch();
    } catch {
      // Handled by BlockingActionModal
    }
  };

  const handleBulkRestore = async () => {
    const toRestore = invoices.filter((inv) => selectedIds.has(inv.id));
    for (const inv of toRestore) {
      try {
        await restoreInvoiceAction(inv.id, inv.invoice_number, inv.entity_id);
      } catch {
        break;
      }
    }
    setSelectedIds(new Set());
    refetch();
  };

  return (
    <div className="space-y-4" data-testid="invoice-archive-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Archive className="w-5 h-5 text-slate-600" />
            <span>Archived & Cancelled Invoices</span>
          </h2>
          <p className="text-xs text-slate-500">
            View historical invoices and restore them back to active billing records.
          </p>
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.size > 0 && canEdit && (
          <div
            className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-sm"
            data-testid="bulk-action-bar"
          >
            <span className="text-xs font-medium">
              {selectedIds.size} invoice(s) selected
            </span>
            <Button
              size="sm"
              onClick={handleBulkRestore}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1 cursor-pointer"
              data-testid="btn-bulk-restore"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore Selected</span>
            </Button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          placeholder="Search archived invoices..."
          className="pl-9 h-9 text-xs"
          data-testid="archive-search-input"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-xs">Loading archived invoices...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div
          className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-2"
          data-testid="empty-archive"
        >
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">Archive is empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No archived or cancelled invoices found in the system.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                {canEdit && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all archived invoices"
                      checked={selectedIds.size === invoices.length && invoices.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 cursor-pointer"
                      data-testid="select-all-checkbox"
                    />
                  </TableHead>
                )}
                <TableHead className="text-xs font-semibold text-slate-700">Invoice #</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Issue Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right">
                  Total
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="hover:bg-slate-50/80 transition-colors"
                  data-testid={`archive-row-${inv.id}`}
                >
                  {canEdit && (
                    <TableCell className="w-10">
                      <input
                        type="checkbox"
                        aria-label={`Select invoice ${inv.invoice_number}`}
                        checked={selectedIds.has(inv.id)}
                        onChange={() => toggleSelectOne(inv.id)}
                        className="rounded border-slate-300 text-blue-600 cursor-pointer"
                        data-testid={`select-invoice-${inv.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-semibold text-slate-900 text-xs py-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      {inv.entity_code && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {inv.entity_code}
                        </Badge>
                      )}
                      <span>{inv.invoice_number}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 py-3">
                    {inv.clients?.name || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 py-3 font-mono">
                    {inv.issue_date?.slice(0, 10) || '—'}
                  </TableCell>
                  <TableCell className="py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStatusBadgeVariant(
                        inv.status
                      )}`}
                    >
                      {inv.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-800 text-right py-3">
                    {formatCurrency(inv.total)}
                  </TableCell>
                  <TableCell className="text-right py-3">
                    <div className="flex items-center justify-end gap-1">
                      {onSelectInvoice && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSelectInvoice(inv)}
                          className="h-7 w-7 text-slate-500 hover:text-slate-900 cursor-pointer"
                          title="View Details"
                          data-testid={`archive-view-btn-${inv.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreSingle(inv)}
                          className="h-7 text-xs text-blue-600 hover:text-blue-700 border-blue-200 gap-1 cursor-pointer"
                          data-testid={`restore-invoice-btn-${inv.id}`}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
