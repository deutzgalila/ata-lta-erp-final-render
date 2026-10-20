import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReportSectionProps {
  title: string;
  badgeCount?: number | string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  dataTestId?: string;
  id?: string;
}

export const ReportSection: React.FC<ReportSectionProps> = ({
  title,
  badgeCount,
  action,
  children,
  className,
  defaultOpen = true,
  collapsible = false,
  dataTestId,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      data-testid={dataTestId}
      className={cn(
        'bg-[#FAF9F5] rounded-none border border-[#0A0A0A] shadow-none overflow-hidden transition-all',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#EAE8E3] border-b border-[#0A0A0A] gap-3">
        <div className="flex items-center gap-2.5">
          {collapsible && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 -ml-1 text-[#4A4945] hover:text-[#0A0A0A] rounded-none transition-colors cursor-pointer"
              aria-expanded={isOpen}
              aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            >
              <ChevronDown
                className={cn(
                  'w-4 h-4 transition-transform duration-200',
                  !isOpen && '-rotate-90'
                )}
              />
            </button>
          )}
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-tight text-[#0A0A0A] leading-none">
            {title}
          </h2>
          {badgeCount !== undefined && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-none border border-[#0A0A0A] font-mono text-xs font-semibold bg-[#FAF9F5] text-[#0A0A0A] tabular-nums"
              data-testid={`${dataTestId || 'section'}-badge`}
            >
              {badgeCount}
            </span>
          )}
        </div>

        {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
      </div>

      {isOpen && <div className="p-4 sm:p-5">{children}</div>}
    </section>
  );
};
