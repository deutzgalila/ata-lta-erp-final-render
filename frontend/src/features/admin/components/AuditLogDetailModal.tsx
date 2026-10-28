import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Code2,
  GitCompare,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/session';
import {
  formatAuditAction,
  getAuditActionBadgeStyle,
  getAuditItemIdentifier,
  getAuditItemRouteLink,
  getAuditModuleLabel,
  parseAuditDiffRows,
  resolveAuditBusinessContext,
} from '../utils/auditFormatters';
import type { AdminUser, AuditLogEntry, EntityCode } from '../api/types';

export interface AuditLogDetailModalProps {
  entry: AuditLogEntry | null;
  usersMap?: Map<string, AdminUser>;
  isOpen: boolean;
  onClose: () => void;
}

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SY';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function formatFullTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditLogDetailModal({
  entry,
  usersMap,
  isOpen,
  onClose,
}: AuditLogDetailModalProps) {
  const navigate = useNavigate();
  const activeEntity = useSessionStore((s) => s.activeEntity);
  const switchEntity = useSessionStore((s) => s.switchEntity);
  const currentUser = useSessionStore((s) => s.user);

  const [viewMode, setViewMode] = useState<'diff' | 'json'>('diff');

  useEffect(() => {
    if (isOpen) {
      setViewMode('diff');
    }
  }, [entry?.id, isOpen]);

  if (!entry) return null;

  const actorId = entry.userId ?? entry.user_id ?? null;
  const actorUser = actorId && usersMap ? usersMap.get(actorId) : undefined;
  const actorName = actorUser?.name ?? (actorId ? actorId : 'System');
  const actorRole = actorUser?.role ?? (actorId ? 'User' : 'Automated');
  const timestamp = entry.timestamp ?? entry.createdAt ?? entry.created_at;
  const entityLabel = entry.entity || 'System';
  const actionLabel = formatAuditAction(entry);
  const actionBadgeClass = getAuditActionBadgeStyle(entry);
  const moduleLabel = getAuditModuleLabel(entry);
  const targetIdentifier = getAuditItemIdentifier(entry, usersMap);
  const routeLink = getAuditItemRouteLink(entry);
  const businessContext = resolveAuditBusinessContext(entry, usersMap);
  const diffRows = parseAuditDiffRows(entry.details, usersMap);

  const handleViewRecord = () => {
    if (!routeLink) return;
    const targetEntity = (entry.entity || '').toUpperCase();
    if (
      (targetEntity === 'ATA' || targetEntity === 'LTA') &&
      activeEntity !== targetEntity &&
      currentUser?.entities?.includes(targetEntity as EntityCode)
    ) {
      switchEntity(targetEntity as EntityCode);
    }
    onClose();
    const searchParams = new URLSearchParams(routeLink.search ?? {});
    const qs = searchParams.toString();
    const targetUrl = qs ? `${routeLink.to}?${qs}` : routeLink.to;
    navigate(targetUrl);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF] p-6 shadow-sm"
        data-testid="audit-detail-modal"
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#0F172A]" />
              <DialogTitle className="text-base font-bold text-[#0F172A]">
                Audit Entry Details
              </DialogTitle>
            </div>
            <span className="inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#475569] tabular-nums">
              AUR-001 · {moduleLabel}
            </span>
          </div>
          <DialogDescription className="text-xs text-[#475569]">
            Immutable record of system activity, actor identity, and field-level state changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Summary Metadata Card */}
          <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Action */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Action
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${actionBadgeClass}`}
                    data-testid="audit-detail-action-badge"
                  >
                    {actionLabel}
                  </span>
                  <span className="font-mono text-[11px] text-[#64748B]">
                    ({entry.action})
                  </span>
                </div>
              </div>

              {/* Actor / User */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Performed By
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF] font-mono text-[11px] font-bold text-[#0F172A]">
                    {getInitials(actorName)}
                  </span>
                  <div className="min-w-0">
                    <span
                      className="truncate text-xs font-semibold text-[#0F172A]"
                      data-testid="audit-detail-actor-name"
                    >
                      {actorName}
                    </span>
                    <span className="ml-1.5 inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF] px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]">
                      {actorRole}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamp */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Timestamp
                </div>
                <div
                  className="mt-1 font-mono text-xs font-medium text-[#0F172A] tabular-nums"
                  data-testid="audit-detail-timestamp"
                >
                  {formatFullTimestamp(timestamp)}
                </div>
              </div>

              {/* Entity & Target Record */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                    Entity
                  </div>
                  <div className="mt-1">
                    <span
                      className="inline-flex items-center rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF] px-2 py-0.5 font-mono text-xs font-semibold text-[#0F172A]"
                      data-testid="audit-detail-entity"
                    >
                      {entityLabel}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                    Log ID
                  </div>
                  <div
                    className="mt-1 truncate font-mono text-xs text-[#475569] tabular-nums"
                    title={entry.id}
                    data-testid="audit-detail-id"
                  >
                    {entry.id}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Business Context Section */}
          {(businessContext.length > 0 || targetIdentifier !== '—') && (
            <div
              className="rounded-[4px] border border-[#E2E8F0] bg-[#FFFFFF] p-3.5"
              data-testid="audit-detail-business-context"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  <Briefcase className="h-3.5 w-3.5 text-[#0F172A]" />
                  Business Context
                </span>
                <span className="font-mono text-xs font-semibold text-[#0F172A]">
                  {targetIdentifier}
                </span>
              </div>
              {businessContext.length > 0 && (
                <div className="grid grid-cols-1 gap-2.5 border-t border-[#E2E8F0] pt-2.5 sm:grid-cols-2">
                  {businessContext.map((ctx, idx) => (
                    <div key={`${ctx.label}-${idx}`} className="flex flex-col">
                      <span className="text-[11px] font-medium text-[#64748B]">
                        {ctx.label}
                      </span>
                      <span
                        className={`mt-0.5 text-xs text-[#0F172A] ${
                          ctx.isCode || ctx.isAmount
                            ? 'font-mono font-semibold tabular-nums'
                            : 'font-medium'
                        }`}
                      >
                        {ctx.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Audit Change Details Section with Segmented View Switcher */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                Audit Change Details
              </span>

              <div className="inline-flex rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('diff')}
                  className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'diff'
                      ? 'bg-[#0F172A] text-[#FFFFFF]'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                  data-testid="audit-view-visual-diff"
                >
                  <GitCompare className="h-3 w-3" />
                  Visual Diff
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('json')}
                  className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'json'
                      ? 'bg-[#0F172A] text-[#FFFFFF]'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                  data-testid="audit-view-raw-json"
                >
                  <Code2 className="h-3 w-3" />
                  Raw JSON
                </button>
              </div>
            </div>

            {viewMode === 'diff' ? (
              <div
                className="rounded-[4px] border border-[#CBD5E1] bg-[#FFFFFF]"
                data-testid="audit-visual-diff-container"
              >
                {diffRows.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#64748B]">
                    No additional field-level payload recorded for this action.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E8F0]">
                    {diffRows.map((row) => (
                      <div
                        key={row.field}
                        className="flex flex-col justify-between gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center"
                        data-testid={`audit-diff-row-${row.field}`}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                          {row.label}
                        </span>
                        {row.isDiff ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span
                              className="inline-flex items-center rounded-[4px] border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 font-mono text-xs text-[#991B1B] line-through"
                              data-testid={`audit-diff-before-${row.field}`}
                            >
                              {row.before ?? 'None'}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-[#64748B]" />
                            <span
                              className="inline-flex items-center rounded-[4px] border border-[#BBF7D0] bg-[#F0FDF4] px-2 py-0.5 font-mono text-xs font-semibold text-[#166534]"
                              data-testid={`audit-diff-after-${row.field}`}
                            >
                              {row.after}
                            </span>
                          </div>
                        ) : (
                          <span
                            className="font-mono text-xs font-medium text-[#0F172A]"
                            data-testid={`audit-diff-value-${row.field}`}
                          >
                            {row.after}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <pre
                className="max-h-72 overflow-auto rounded-[4px] border border-[#0F172A] bg-[#0F172A] p-3.5 font-mono text-xs leading-relaxed text-[#F8FAFC]"
                data-testid="audit-raw-json-pre"
              >
                {JSON.stringify(entry.details ?? {}, null, 2)}
              </pre>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-3 sm:justify-between">
          <div>
            {routeLink && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleViewRecord}
                className="h-8 gap-1.5 rounded-[4px] border-[#1E40AF] bg-[#EFF6FF] text-xs font-semibold text-[#1E40AF] hover:bg-[#DBEAFE]"
                data-testid="audit-view-record-btn"
              >
                <span>View Record</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 rounded-[4px] border-[#CBD5E1] text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            data-testid="audit-detail-close-btn"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
