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
            'grid gap-px bg-[#0A0A0A] border border-[#0A0A0A] rounded-none',
            columns === 1 && 'grid-cols-1',
            columns === 2 && 'grid-cols-1 sm:grid-cols-2',
            columns === 3 && 'grid-cols-1 sm:grid-cols-3',
            columns >= 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          )}
        >
          {Array.from({ length: columns }).map((_, idx) => (
            <div
              key={idx}
              className="bg-[#FAF9F5] rounded-none p-4 shadow-none"
            >
              <div className="h-4 w-24 bg-[#EAE8E3] rounded-none mb-3" />
              <div className="h-7 w-32 bg-[#EAE8E3] rounded-none" />
            </div>
          ))}
        </div>
      )}

      {(type === 'full' || type === 'table') && (
        <div className="bg-[#FAF9F5] rounded-none border border-[#0A0A0A] shadow-none overflow-hidden">
          <div className="p-4 bg-[#EAE8E3] border-b border-[#0A0A0A] flex items-center justify-between">
            <div className="h-5 w-36 bg-[#C8C5BC] rounded-none" />
            <div className="h-4 w-16 bg-[#C8C5BC] rounded-none" />
          </div>
          <div className="divide-y divide-[#C8C5BC]">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <div
                key={rIdx}
                className="h-11 px-4 flex items-center justify-between gap-4"
              >
                <div className="h-4 w-1/4 bg-[#EAE8E3] rounded-none" />
                <div className="h-4 w-1/4 bg-[#EAE8E3] rounded-none" />
                <div className="h-4 w-1/6 bg-[#EAE8E3] rounded-none" />
                <div className="h-4 w-1/6 bg-[#EAE8E3] rounded-none" />
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
        'p-5 sm:p-6 bg-[#FAF9F5] border-2 border-[#E61919] rounded-none shadow-none text-[#0A0A0A] space-y-3',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[#E61919] shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold uppercase tracking-tight text-[#E61919] leading-snug">
              {title}
            </h3>
            {staleDataNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-medium px-2 py-0.5 rounded-none bg-[#FDF3D7] text-[#734800] border border-[#B87500]">
                <AlertTriangle className="w-3 h-3 text-[#734800]" />
                Showing previously loaded data
              </span>
            )}
          </div>
          <p className="text-xs text-[#4A4945] leading-relaxed">{message}</p>
        </div>

        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="text-xs font-mono font-semibold h-8 px-3 bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] rounded-none cursor-pointer shadow-none shrink-0 transition-colors"
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
        'p-8 sm:p-10 bg-[#FAF9F5] rounded-none border-2 border-dashed border-[#0A0A0A] text-center shadow-none my-4',
        className
      )}
    >
      <div className="w-10 h-10 rounded-none bg-[#EAE8E3] border border-[#0A0A0A] text-[#4A4945] flex items-center justify-center mx-auto mb-3">
        {icon || <Inbox className="w-5 h-5 text-[#4A4945]" />}
      </div>
      <h3 className="text-sm font-bold uppercase tracking-tight text-[#0A0A0A]">{title}</h3>
      {description && (
        <p className="text-xs text-[#4A4945] mt-1 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {onReset && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReset}
          className="mt-4 text-xs font-mono font-semibold h-8 px-3.5 text-[#0A0A0A] border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] rounded-none cursor-pointer shadow-none transition-colors"
          data-testid="report-empty-reset-btn"
        >
          {resetLabel}
        </Button>
      )}
    </div>
  );
};
