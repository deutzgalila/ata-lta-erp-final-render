import React from 'react';
import { cn } from '@/lib/utils';

export interface ReportTableContainerProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string; // e.g. 'min-w-[640px]'
  dataTestId?: string;
  ariaLabel?: string;
}

export const ReportTableContainer: React.FC<ReportTableContainerProps> = ({
  children,
  className,
  minWidth = 'min-w-[640px]',
  dataTestId = 'report-table-container',
  ariaLabel = 'Report data table',
}) => {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      data-testid={dataTestId}
      className={cn(
        'w-full overflow-x-auto rounded-xl border border-slate-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs',
        '[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm',
        '[&_thead]:bg-slate-50/75 [&_thead]:border-b [&_thead]:border-slate-200',
        '[&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-slate-600 [&_th]:whitespace-nowrap',
        '[&_tbody_tr]:border-b [&_tbody_tr]:border-slate-100 [&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-slate-50/50',
        '[&_tbody_tr]:h-11 sm:[&_tbody_tr]:h-12',
        '[&_td]:px-4 [&_td]:py-2.5 [&_td]:text-slate-700 [&_td]:align-middle',
        '[&_.tabular-nums]:font-sans [&_.tabular-nums]:tabular-nums',
        className
      )}
    >
      <div className={minWidth}>{children}</div>
    </div>
  );
};
