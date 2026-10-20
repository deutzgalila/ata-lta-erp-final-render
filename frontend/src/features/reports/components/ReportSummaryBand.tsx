import React from 'react';
import { cn } from '@/lib/utils';

export interface SummaryMetricItem {
  label: string;
  value: string;
  subtext?: string;
  attention?: boolean;
  dataTestId?: string;
}

export interface ReportSummaryCardProps {
  label: string;
  value: string;
  subtext?: string;
  attention?: boolean;
  dataTestId?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ReportSummaryCard: React.FC<ReportSummaryCardProps> = ({
  label,
  value,
  subtext,
  attention = false,
  dataTestId,
  className,
  children,
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        'bg-[#FAF9F5] rounded-none border-0 p-4 shadow-none transition-colors',
        attention
          ? 'border-t-4 border-t-[#E61919] bg-[#FCE8E8]/40'
          : 'hover:bg-[#E4E2DC]/50',
        className
      )}
    >
      <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
        {label}
      </div>
      <div className="font-mono text-xl sm:text-2xl font-bold text-[#0A0A0A] tracking-tight tabular-nums mt-1">
        {value}
      </div>
      {subtext && <div className="text-xs text-[#4A4945] mt-1">{subtext}</div>}
      {children}
    </div>
  );
};

export interface ReportSummaryBandProps {
  metrics?: SummaryMetricItem[];
  children?: React.ReactNode;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  isLoading?: boolean;
}

export const ReportSummaryBand: React.FC<ReportSummaryBandProps> = ({
  metrics,
  children,
  columns,
  className,
  isLoading = false,
}) => {
  // Determine column count based on prop or number of metrics
  const colCount = columns || (metrics ? Math.min(Math.max(metrics.length, 1), 6) : 3);

  const getGridColsClass = (cols: number) => {
    switch (cols) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 3:
        return 'grid-cols-1 sm:grid-cols-3';
      case 4:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
      case 5:
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5';
      case 6:
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    }
  };

  if (isLoading) {
    const skeletonCount = metrics?.length || columns || 3;
    return (
      <div
        className={cn(
          'grid gap-px bg-[#0A0A0A] border border-[#0A0A0A] rounded-none',
          getGridColsClass(colCount),
          className
        )}
        data-testid="report-summary-band-loading"
      >
        {Array.from({ length: skeletonCount }).map((_, idx) => (
          <div
            key={idx}
            className="bg-[#FAF9F5] rounded-none p-4 shadow-none animate-pulse motion-reduce:animate-none"
          >
            <div className="h-4 w-24 bg-[#EAE8E3] rounded-none mb-3" />
            <div className="h-7 w-32 bg-[#EAE8E3] rounded-none" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-px bg-[#0A0A0A] border border-[#0A0A0A] rounded-none',
        getGridColsClass(colCount),
        className
      )}
      data-testid="report-summary-band"
    >
      {metrics?.map((metric, idx) => (
        <ReportSummaryCard
          key={idx}
          label={metric.label}
          value={metric.value}
          subtext={metric.subtext}
          attention={metric.attention}
          dataTestId={metric.dataTestId}
        />
      ))}
      {children}
    </div>
  );
};
