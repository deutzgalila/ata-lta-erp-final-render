import React, { useState, useMemo } from 'react';
import {
  Search,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuditLogsList } from '../api/useAuditLogs';
import { useUsersList } from '../api/useUsers';
import {
  formatAuditAction,
  getAuditActionBadgeStyle,
  getAuditItemIdentifier,
  getAuditModuleLabel,
} from '../utils/auditFormatters';
import { AuditLogDetailModal } from './AuditLogDetailModal';
import type { AdminUser, AuditLogEntry, AuditLogFilterParams } from '../api/types';

const PAGE_LIMIT = 50;

const MODULE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Modules' },
  { value: 'users', label: 'Users & Access' },
  { value: 'work_requests', label: 'Operations / Work Requests' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'invoices', label: 'Billing & Invoices' },
  { value: 'disbursements', label: 'Disbursements' },
  { value: 'documents', label: 'Documents' },
  { value: 'transmittals', label: 'Transmittals' },
  { value: 'clients', label: 'Clients' },
] as const;

function formatTableTimestamp(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }),
    time: d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

export function AuditLogView() {
  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState<number>(1);

  // Selected entry for Detail Modal
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Users directory for actor/target resolution
  const { data: users = [] } = useUsersList();
  const usersMap = useMemo(() => {
    const map = new Map<string, AdminUser>();
    for (const u of users) {
      map.set(u.id, u);
    }
    return map;
  }, [users]);

  const filterParams = useMemo<AuditLogFilterParams>(() => {
    const params: AuditLogFilterParams = {
      page,
      limit: PAGE_LIMIT,
      sortOrder,
    };
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }
    if (moduleFilter !== 'ALL') {
      params.tableName = moduleFilter;
    }
    if (userFilter !== 'ALL') {
      params.userId = userFilter;
    }
    if (dateFrom) {
      params.from = dateFrom;
    }
    if (dateTo) {
      params.to = dateTo;
    }
    return params;
  }, [page, sortOrder, searchQuery, moduleFilter, userFilter, dateFrom, dateTo]);

  const { data: auditResponse, isLoading, error } = useAuditLogsList(filterParams);

  const entries = auditResponse?.data ?? [];
  const totalEntries = auditResponse?.meta?.total ?? entries.length;
  const currentLimit = auditResponse?.meta?.limit ?? PAGE_LIMIT;
  const totalPages = Math.max(1, Math.ceil(totalEntries / currentLimit));

  const startIndex = totalEntries === 0 ? 0 : (page - 1) * currentLimit + 1;
  const endIndex = Math.min(totalEntries, page * currentLimit);

  const handleResetFilters = () => {
    setSearchQuery('');
    setModuleFilter('ALL');
    setUserFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setSortOrder('desc');
    setPage(1);
  };

  if (isLoading && !auditResponse) {
    return (
      <div
        className="space-y-3 p-4"
        data-testid="audit-loading-skeleton"
      >
        <div className="h-12 w-full animate-pulse rounded-[4px] bg-[#F8FAFC]" />
        <div className="h-72 w-full animate-pulse rounded-[4px] bg-[#F8FAFC]" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-[4px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-xs font-medium text-[#991B1B]"
        data-testid="audit-error-alert"
      >
        Failed to load audit log: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="audit-log-view">
      {/* Compliance Header Banner */}
      <div className="flex flex-col justify-between gap-2 rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#0F172A]" />
          <span className="text-xs font-bold text-[#0F172A]">
            System Audit Trail
          </span>
          <span
            className="inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#0F172A]"
            data-testid="audit-aur-badge"
          >
            AUR-001
          </span>
        </div>
        <span className="text-xs text-[#475569]">
          Immutable append-only compliance ledger · Read-only verification view
        </span>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <Input
              type="text"
              placeholder="Search action, table, record ID, or details..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-[4px] border-[#CBD5E1] pl-8 text-xs text-[#0F172A]"
              data-testid="audit-search-input"
            />
          </div>

          {/* Module / Category Filter */}
          <Select
            value={moduleFilter}
            onValueChange={(val) => {
              setModuleFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="h-8 w-[185px] rounded-[4px] border-[#CBD5E1] text-xs text-[#0F172A]"
              data-testid="audit-module-filter"
            >
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              {MODULE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* User Filter */}
          <Select
            value={userFilter}
            onValueChange={(val) => {
              setUserFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="h-8 w-[175px] rounded-[4px] border-[#CBD5E1] text-xs text-[#0F172A]"
              data-testid="audit-user-filter"
            >
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">
                All Users
              </SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-xs">
                  {u.name} ({u.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Range: From */}
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
              From
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="h-8 w-[135px] rounded-[4px] border-[#CBD5E1] font-mono text-xs text-[#0F172A] tabular-nums"
              data-testid="audit-date-from"
            />
          </div>

          {/* Date Range: To */}
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
              To
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="h-8 w-[135px] rounded-[4px] border-[#CBD5E1] font-mono text-xs text-[#0F172A] tabular-nums"
              data-testid="audit-date-to"
            />
          </div>

          {/* Sort Order */}
          <Select
            value={sortOrder}
            onValueChange={(val) => {
              setSortOrder(val as 'desc' | 'asc');
              setPage(1);
            }}
          >
            <SelectTrigger
              className="h-8 w-[155px] rounded-[4px] border-[#CBD5E1] text-xs text-[#0F172A]"
              data-testid="audit-sort-order"
            >
              <SelectValue placeholder="Sort Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc" className="text-xs">
                Newest First (DESC)
              </SelectItem>
              <SelectItem value="asc" className="text-xs">
                Oldest First (ASC)
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Reset Filters Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
            className="h-8 gap-1 rounded-[4px] border-[#CBD5E1] text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            data-testid="audit-reset-filters"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>

      {/* High-Density Brutalist-Minimalist Table */}
      <div
        className="overflow-hidden rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF]"
        data-testid="audit-log-table"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#CBD5E1] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Module / Table</th>
                <th className="px-4 py-2.5">Target Record</th>
                <th className="px-4 py-2.5">Entity</th>
                <th className="px-4 py-2.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#64748B]">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <FileSearch className="h-6 w-6 text-[#64748B]" />
                      <p className="text-xs font-semibold text-[#0F172A]">
                        No audit entries match the current filters
                      </p>
                      <p className="text-xs text-[#64748B]">
                        Adjust your search query, module filter, or date range to inspect historical records.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const ts = formatTableTimestamp(
                    entry.timestamp ?? entry.createdAt ?? entry.created_at
                  );
                  const actorId = entry.userId ?? entry.user_id ?? null;
                  const actorUser =
                    actorId && usersMap ? usersMap.get(actorId) : undefined;
                  const actorName =
                    actorUser?.name ?? (actorId ? actorId : 'System');
                  const actorRole = actorUser?.role;
                  const actionLabel = formatAuditAction(entry);
                  const actionBadgeStyle = getAuditActionBadgeStyle(entry);
                  const moduleLabel = getAuditModuleLabel(entry);
                  const tableRaw = entry.tableName ?? entry.table_name ?? '';
                  const targetIdentifier = getAuditItemIdentifier(entry, usersMap);
                  const entityDisplay = entry.entity || 'System';

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className="cursor-pointer transition-colors hover:bg-[#F8FAFC]"
                      data-testid={`audit-row-${entry.id}`}
                    >
                      {/* 1. Timestamp */}
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-[#475569] tabular-nums">
                        <div className="font-medium text-[#0F172A]">{ts.date}</div>
                        {ts.time && (
                          <div className="text-[11px] text-[#64748B]">{ts.time}</div>
                        )}
                      </td>

                      {/* 2. User */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#0F172A]">
                            {actorName}
                          </span>
                          {actorRole && (
                            <span className="inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]">
                              {actorRole}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Action */}
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${actionBadgeStyle}`}
                          data-testid={`audit-action-badge-${entry.id}`}
                        >
                          {actionLabel}
                        </span>
                      </td>

                      {/* 4. Module / Table */}
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 font-mono text-xs font-medium text-[#0F172A]">
                          {tableRaw || moduleLabel}
                        </span>
                      </td>

                      {/* 5. Target Record */}
                      <td className="px-4 py-2.5">
                        <span
                          className="font-mono text-xs font-medium text-[#0F172A]"
                          data-testid={`audit-target-${entry.id}`}
                        >
                          {targetIdentifier}
                        </span>
                      </td>

                      {/* 6. Entity */}
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-xs font-semibold text-[#0F172A]">
                          {entityDisplay}
                        </span>
                      </td>

                      {/* 7. Details */}
                      <td
                        className="px-4 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEntry(entry)}
                          title="View Audit Details"
                          className="h-7 gap-1 rounded-[4px] px-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                          data-testid={`audit-details-btn-${entry.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Details</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div
          className="flex flex-col items-center justify-between gap-2 border-t border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2.5 text-xs text-[#475569] sm:flex-row"
          data-testid="audit-pagination-bar"
        >
          <div className="font-mono tabular-nums" data-testid="audit-pagination-summary">
            Showing {startIndex}–{endIndex} of {totalEntries} audit entries
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#475569] tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 gap-1 rounded-[4px] border-[#CBD5E1] bg-[#FFFFFF] px-2 text-xs text-[#0F172A] disabled:opacity-50"
              data-testid="audit-prev-page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 gap-1 rounded-[4px] border-[#CBD5E1] bg-[#FFFFFF] px-2 text-xs text-[#0F172A] disabled:opacity-50"
              data-testid="audit-next-page"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Audit Detail Modal */}
      <AuditLogDetailModal
        entry={selectedEntry}
        usersMap={usersMap}
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
