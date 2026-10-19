import React from 'react';
import { cn } from '@/lib/utils';

export interface ReportToolbarProps {
  children: React.ReactNode;
  className?: string;
  dataTestId?: string;
}

export interface ReportToolbarGroupProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

export const ReportToolbarGroup: React.FC<ReportToolbarGroupProps> = ({
  children,
  className,
  align = 'left',
}) => {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        align === 'right' && 'ml-auto',
        className
      )}
    >
      {children}
    </div>
  );
};

export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  children,
  className,
  dataTestId = 'report-toolbar',
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 bg-[#EAE8E3] p-3 sm:p-4 rounded-none border border-[#0A0A0A] shadow-none',
        className
      )}
    >
      {children}
    </div>
  );
};
