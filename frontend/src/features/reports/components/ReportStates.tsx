import React from 'react';
import { AlertCircle, RefreshCw, Inbox, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ==========================================
// 1. ReportLoadingState
// ==========================================
export interface ReportLoadingStateProps {
  type?: 'summary' | 'table' | 'full';
  rows?: number;
  columns?: number;
  className?: string;
  dataTestId?: string;
}

export const ReportLoadingState: React.FC<ReportLoadingStateProps> = ({
  type = 'full',
  rows = 5,
  columns = 4,
  className,
  dataTestId = 'report-loading-state',
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={cn('space-y-4 animate-pulse motion-reduce:animate-none', className)}
    >
      {(type === 'full' || type === 'summary') && (
        <div
          className={cn(
            'grid gap-3 sm:gap-4',
            columns === 1 && 'grid-cols-1',
            columns === 2 && 'grid-cols-1 sm:grid-cols-2',
            columns === 3 && 'grid-cols-1 sm:grid-cols-3',
            columns >= 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          )}
        >
          {Array.from({ length: columns }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs"
            >
              <div className="h-4 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {(type === 'full' || type === 'table') && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="h-5 w-36 bg-slate-200 rounded" />
            <div className="h-4 w-16 bg-slate-200 rounded" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <div
                key={rIdx}
                className="h-12 px-4 flex items-center justify-between gap-4"
              >
                <div className="h-4 w-1/4 bg-slate-200/80 rounded" />
                <div className="h-4 w-1/4 bg-slate-200/80 rounded" />
                <div className="h-4 w-1/6 bg-slate-200/80 rounded" />
                <div className="h-4 w-1/6 bg-slate-200/80 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. ReportErrorState
// ==========================================
export interface ReportErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  staleDataNotice?: boolean;
  className?: string;
  dataTestId?: string;
}

export const ReportErrorState: React.FC<ReportErrorStateProps> = ({
  title = 'Unable to load report',
  message = 'An error occurred while fetching report data. Please check your connection and try again.',
  onRetry,
  staleDataNotice = false,
  className,
  dataTestId = 'report-error-state',
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        'p-5 sm:p-6 bg-red-50/70 border border-red-200/90 rounded-xl shadow-2xs text-slate-800 space-y-3',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-red-900 leading-snug">
              {title}
            </h3>
            {staleDataNotice && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                <AlertTriangle className="w-3 h-3 text-amber-700" />
                Showing previously loaded data
              </span>
            )}
          </div>
          <p className="text-xs text-red-700 leading-relaxed">{message}</p>
        </div>

        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="text-xs font-medium h-8 px-3 bg-white border-red-300 text-red-800 hover:bg-red-100 hover:text-red-950 cursor-pointer shadow-2xs shrink-0"
            data-testid="report-error-retry-btn"
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 3. ReportEmptyState
// ==========================================
export interface ReportEmptyStateProps {
  title: string;
  description?: string;
  onReset?: () => void;
  resetLabel?: string;
  icon?: React.ReactNode;
  className?: string;
  dataTestId?: string;
}

export const ReportEmptyState: React.FC<ReportEmptyStateProps> = ({
  title,
  description,
  onReset,
  resetLabel = 'Clear filters',
  icon,
  className,
  dataTestId = 'report-empty-state',
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        'p-8 sm:p-10 bg-white rounded-xl border border-dashed border-slate-200 text-center shadow-2xs my-4',
        className
      )}
    >
      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
        {icon || <Inbox className="w-5 h-5 text-slate-400" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {onReset && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReset}
          className="mt-4 text-xs font-medium h-8 px-3 text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer"
          data-testid="report-empty-reset-btn"
        >
          {resetLabel}
        </Button>
      )}
    </div>
  );
};
