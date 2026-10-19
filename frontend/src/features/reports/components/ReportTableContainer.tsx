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
        'w-full overflow-x-auto rounded-none border border-[#0A0A0A] bg-[#FAF9F5] shadow-none focus:outline-none focus:ring-2 focus:ring-[#0A0A0A]',
        '[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs sm:[&_table]:text-sm',
        '[&_thead]:bg-[#EAE8E3] [&_thead]:border-b [&_thead]:border-[#0A0A0A]',
        '[&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-mono [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-[#0A0A0A] [&_th]:whitespace-nowrap',
        '[&_tbody_tr]:border-b [&_tbody_tr]:border-[#C8C5BC] [&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-[#E4E2DC]/60',
        '[&_tbody_tr]:h-10 sm:[&_tbody_tr]:h-11',
        '[&_td]:px-4 [&_td]:py-2.5 [&_td]:text-[#0A0A0A] [&_td]:align-middle',
        '[&_.tabular-nums]:font-mono [&_.tabular-nums]:tabular-nums',
        className
      )}
    >
      <div className={minWidth}>{children}</div>
    </div>
  );
};
