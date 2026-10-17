import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api';

/**
 * Checks whether an error is an RFC 7807 Concurrency Conflict (HTTP 409).
 */
export function isConcurrencyConflictError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  const code = (err as { code?: string }).code;
  return (
    status === 409 ||
    code === 'CONCURRENCY_CONFLICT' ||
    code === 'ERR_CONCURRENCY_CONFLICT'
  );
}

export interface ConflictFieldComparison {
  fieldName?: string;
  fieldLabel?: string;
  label?: string;
  localValue: React.ReactNode;
  serverValue: React.ReactNode;
}

export interface ConflictResolutionModalProps {
  // Modal visibility
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;

  // Error / RFC 7807 context
  error?: ApiError | Error | null;
  errorMessage?: string;

  // Entity metadata
  title?: string;
  entityTitle?: string;
  entityName?: string;
  entityType?: string;
  entityId?: string;
  recordIdentifier?: string;

  // Version indicators
  expectedVersion?: number | null;
  serverVersion?: number | null;
  localVersion?: number | null;

  // Explicit diffs
  comparisons?: ConflictFieldComparison[];
  localValues?: Record<string, unknown>;
  serverValues?: Record<string, unknown>;

  // Fallbacks for quick-action status changes
  attemptedStatus?: string | null;
  currentStatus?: string | null;

  // Actions
  onRefreshAndKeepLatest?: () => Promise<void> | void;
  onRefreshLatest?: () => Promise<void> | void;
  onCancel?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
}

export function ConflictResolutionModal({
  isOpen,
  open,
  onClose,
  onOpenChange,
  error,
  errorMessage,
  title,
  entityTitle,
  entityName,
  entityType = 'Work Request',
  recordIdentifier,
  expectedVersion,
  serverVersion,
  localVersion,
  comparisons,
  localValues,
  serverValues,
  attemptedStatus,
  currentStatus,
  onRefreshAndKeepLatest,
  onRefreshLatest,
  onCancel,
  isRefreshing,
  isLoading,
}: ConflictResolutionModalProps) {
  const isModalOpen = Boolean(isOpen ?? open);
  const refreshing = Boolean(isRefreshing ?? isLoading);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onCancel?.();
      onClose?.();
      onOpenChange?.(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onClose?.();
    onOpenChange?.(false);
  };

  const handleRefresh = async () => {
    try {
      if (onRefreshAndKeepLatest) {
        await onRefreshAndKeepLatest();
      } else if (onRefreshLatest) {
        await onRefreshLatest();
      }
    } finally {
      onClose?.();
      onOpenChange?.(false);
    }
  };

  // Derive error details
  const errorCode =
    (error && typeof error === 'object' && 'code' in error && (error as ApiError).code) ||
    'CONCURRENCY_CONFLICT';

  const detailMessage =
    (error && typeof error === 'object' && 'detail' in error && (error as ApiError).detail) ||
    (error && error.message) ||
    errorMessage ||
    'The record was modified by another user. Please reload the latest version before editing.';

  const localVer = expectedVersion ?? localVersion;
  const targetTitle = recordIdentifier || entityTitle || entityName;

  // Compute field comparisons
  const computedComparisons = React.useMemo<ConflictFieldComparison[]>(() => {
    if (comparisons && comparisons.length > 0) {
      return comparisons.map((c) => ({
        ...c,
        label: c.label || c.fieldLabel || c.fieldName || 'Field',
      }));
    }

    const list: ConflictFieldComparison[] = [];

    if (localValues || serverValues) {
      const allKeys = Array.from(
        new Set([...Object.keys(localValues || {}), ...Object.keys(serverValues || {})])
      );
      for (const k of allKeys) {
        list.push({
          fieldName: k,
          label: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'),
          localValue: localValues?.[k] !== undefined ? String(localValues[k]) : '—',
          serverValue: serverValues?.[k] !== undefined ? String(serverValues[k]) : '—',
        });
      }
    } else if (attemptedStatus !== undefined || currentStatus !== undefined) {
      list.push({
        fieldName: 'status',
        label: 'Status',
        localValue: attemptedStatus ?? '—',
        serverValue: currentStatus ?? '—',
      });
    }

    if (localVer !== undefined || serverVersion !== undefined) {
      list.push({
        fieldName: 'version',
        label: 'Version',
        localValue: localVer !== null && localVer !== undefined ? `Version ${localVer}` : '—',
        serverValue:
          serverVersion !== null && serverVersion !== undefined
            ? `Version ${serverVersion}`
            : 'Latest',
      });
    }

    return list;
  }, [comparisons, localValues, serverValues, attemptedStatus, currentStatus, localVer, serverVersion]);

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="conflict-resolution-modal"
        className="max-w-xl w-full p-6 space-y-4"
      >
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-semibold text-[#1e293b]">
            {title || 'Record Out of Sync'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#64748b]">
            {targetTitle
              ? `Conflict detected on ${entityType}: "${targetTitle}". Another user updated this record while you were editing.`
              : `Conflict detected on this ${entityType}. Another user updated this record while you were editing.`}
          </DialogDescription>
        </DialogHeader>

        {/* Out-of-sync Warning Banner */}
        <div
          data-testid="conflict-warning-banner"
          className="bg-amber-50 border border-amber-200/80 rounded-lg p-3.5 space-y-2"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap justify-between">
                <span className="font-semibold text-xs sm:text-sm text-amber-900">
                  Record Out of Sync: Another user modified this record while you were editing.
                </span>
                <Badge
                  variant="destructive"
                  data-testid="error-code-badge"
                  className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5"
                >
                  {errorCode}
                </Badge>
              </div>
              <p
                data-testid="conflict-detail-message"
                className="text-xs text-amber-800 leading-relaxed"
              >
                {detailMessage}
              </p>
            </div>
          </div>
        </div>

        {/* Side-by-Side Comparison Container */}
        <div
          data-testid="conflict-comparison-view"
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5"
        >
          {/* Column Headers */}
          <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-200 text-xs font-semibold">
            <div className="flex items-center justify-between text-blue-900">
              <span>Your Attempted Changes</span>
              <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300 bg-blue-50/60">
                {localVer !== null && localVer !== undefined ? `v${localVer}` : 'Local Draft'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-slate-800">
              <span>Authoritative Server Record</span>
              <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">
                {serverVersion !== null && serverVersion !== undefined ? `v${serverVersion}` : 'Server Truth'}
              </Badge>
            </div>
          </div>

          {/* Field Diffs */}
          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {computedComparisons.map((comp, idx) => (
              <div key={idx} className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  {comp.label}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    data-testid="conflict-local-value"
                    className="text-xs font-medium text-blue-800 bg-blue-50/50 p-2 rounded border border-blue-200/60 break-words"
                  >
                    {comp.localValue ?? '—'}
                  </div>
                  <div
                    data-testid="conflict-server-value"
                    className="text-xs font-medium text-slate-800 bg-white p-2 rounded border border-slate-200 break-words"
                  >
                    {comp.serverValue ?? '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution Actions */}
        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            data-testid="conflict-cancel-btn"
            onClick={handleCancel}
            disabled={refreshing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            data-testid="conflict-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh & Keep Latest'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
