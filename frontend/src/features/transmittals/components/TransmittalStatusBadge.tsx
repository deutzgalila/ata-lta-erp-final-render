/**
 * Status and Approval badges for Transmittals (Module #5)
 */

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Send, XCircle, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { TransmittalStatus } from '../api/types';

export interface TransmittalStatusBadgeProps {
  status: TransmittalStatus;
  className?: string;
}

export function TransmittalStatusBadge({ status, className = '' }: TransmittalStatusBadgeProps) {
  switch (status) {
    case 'Draft':
      return (
        <Badge
          variant="outline"
          className={`bg-[#FAF9F5] text-[#4A4945] border-[#0A0A0A] rounded-none font-mono text-xs font-bold flex items-center gap-1 ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Draft"
        >
          <Clock className="h-3 w-3 text-[#4A4945]" />
          Draft
        </Badge>
      );
    case 'Sent':
      return (
        <Badge
          variant="outline"
          className={`bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A] rounded-none font-mono text-xs font-bold flex items-center gap-1 ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Sent"
        >
          <Send className="h-3 w-3 text-[#0A0A0A]" />
          Sent
        </Badge>
      );
    case 'Acknowledged':
      return (
        <Badge
          variant="outline"
          className={`bg-[#0A0A0A] text-[#FAF9F5] border-[#0A0A0A] rounded-none font-mono text-xs font-bold flex items-center gap-1 ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Acknowledged"
        >
          <CheckCircle2 className="h-3 w-3 text-[#FAF9F5]" />
          Acknowledged
        </Badge>
      );
    case 'Cancelled':
      return (
        <Badge
          variant="outline"
          className={`bg-[#FAF9F5] text-[#E61919] border-[#E61919] rounded-none font-mono text-xs font-bold flex items-center gap-1 ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Cancelled"
        >
          <XCircle className="h-3 w-3 text-[#E61919]" />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={`rounded-none border-[#0A0A0A] font-mono text-xs ${className}`} data-testid="transmittal-status-badge">
          {status}
        </Badge>
      );
  }
}

export interface TransmittalApprovalBadgeProps {
  approved: boolean;
  status?: TransmittalStatus;
  className?: string;
}

export function TransmittalApprovalBadge({
  approved,
  status,
  className = '',
}: TransmittalApprovalBadgeProps) {
  // If not draft and already sent or acknowledged, approval is inherently granted
  if (status && status !== 'Draft') {
    return null;
  }

  if (approved) {
    return (
      <Badge
        variant="outline"
        className={`bg-[#0A0A0A] text-[#FAF9F5] border-[#0A0A0A] rounded-none flex items-center gap-1 font-mono font-bold text-xs ${className}`}
        data-testid="transmittal-approval-badge"
        data-approved="true"
      >
        <ShieldCheck className="h-3 w-3 text-[#FAF9F5]" />
        Approved
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A] rounded-none flex items-center gap-1 font-mono font-bold text-xs ${className}`}
      data-testid="transmittal-approval-badge"
      data-approved="false"
    >
      <ShieldAlert className="h-3 w-3 text-[#0A0A0A]" />
      Pending Admin Approval
    </Badge>
  );
}
