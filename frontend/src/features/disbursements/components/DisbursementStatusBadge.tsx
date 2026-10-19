import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DisbursementStatus } from '../api/types';

export interface DisbursementStatusBadgeProps {
  status: DisbursementStatus | string;
  className?: string;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  Draft: {
    label: 'Draft',
    className: 'bg-[#F8FAFC] text-[#334155] border-[#E2E8F0] hover:bg-[#F8FAFC]',
  },
  Submitted: {
    label: 'Submitted',
    className: 'bg-[#EFF6FF] text-[#1E40AF] border-[#93C5FD] hover:bg-[#EFF6FF]',
  },
  Pending: {
    label: 'Pending',
    className: 'bg-[#FEFCE8] text-[#854D0E] border-[#FDE047] hover:bg-[#FEFCE8]',
  },
  'Pending Admin Approval': {
    label: 'Pending Admin Approval',
    className: 'bg-[#FEFCE8] text-[#854D0E] border-[#FDE047] hover:bg-[#FEFCE8]',
  },
  Approved: {
    label: 'Approved',
    className: 'bg-[#EFF6FF] text-[#1E40AF] border-[#93C5FD] hover:bg-[#EFF6FF]',
  },
  Released: {
    label: 'Released',
    className: 'bg-[#F0F9FF] text-[#075985] border-[#7DD3FC] hover:bg-[#F0F9FF]',
  },
  Funded: {
    label: 'Funded',
    className: 'bg-[#F0FDF4] text-[#166534] border-[#86EFAC] hover:bg-[#F0FDF4]',
  },
  Rejected: {
    label: 'Rejected',
    className: 'bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5] hover:bg-[#FEF2F2]',
  },
  Archived: {
    label: 'Archived',
    className: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1] hover:bg-[#F1F5F9]',
  },
  Cancelled: {
    label: 'Cancelled',
    className: 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F8FAFC]',
  },
};

export const DisbursementStatusBadge: React.FC<DisbursementStatusBadgeProps> = ({
  status,
  className,
}) => {
  const config = statusStyles[status] || {
    label: status,
    className: 'bg-[#F8FAFC] text-[#334155] border-[#E2E8F0]',
  };

  return (
    <Badge
      variant="outline"
      data-testid="disbursement-status-badge"
      data-test-status={status.toLowerCase()}
      className={cn(
        ' font-medium text-xs px-2.5 py-0.5 rounded-[6px] border transition-none',
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
};
