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
          className={`bg-slate-50 text-slate-700 border-slate-300 flex items-center gap-1 font-medium ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Draft"
        >
          <Clock className="h-3 w-3 text-slate-500" />
          Draft
        </Badge>
      );
    case 'Sent':
      return (
        <Badge
          variant="outline"
          className={`bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 font-medium ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Sent"
        >
          <Send className="h-3 w-3 text-blue-500" />
          Sent
        </Badge>
      );
    case 'Acknowledged':
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-50 text-emerald-700 border-emerald-300 flex items-center gap-1 font-medium ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Acknowledged"
        >
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Acknowledged
        </Badge>
      );
    case 'Cancelled':
      return (
        <Badge
          variant="outline"
          className={`bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1 font-medium ${className}`}
          data-testid="transmittal-status-badge"
          data-status="Cancelled"
        >
          <XCircle className="h-3 w-3 text-rose-500" />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className} data-testid="transmittal-status-badge">
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
        className={`bg-emerald-50 text-emerald-700 border-emerald-300 flex items-center gap-1 font-normal text-xs ${className}`}
        data-testid="transmittal-approval-badge"
        data-approved="true"
      >
        <ShieldCheck className="h-3 w-3 text-emerald-600" />
        Approved
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`bg-amber-50 text-amber-700 border-amber-300 flex items-center gap-1 font-normal text-xs ${className}`}
      data-testid="transmittal-approval-badge"
      data-approved="false"
    >
      <ShieldAlert className="h-3 w-3 text-amber-600" />
      Pending Admin Approval
    </Badge>
  );
}
