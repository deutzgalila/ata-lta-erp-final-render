import React from 'react';
import {
  Clock,
  Layers,
  Zap,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Ban,
  DollarSign,
  Receipt,
  PauseCircle,
} from 'lucide-react';

export interface PhaseBadgeInfo {
  label: string;
  badgeClass: string;
  dotClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export interface StatusBadgeInfo {
  label: string;
  badgeClass: string;
  dotClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export function getPhaseBadgeInfo(phase?: string | null): PhaseBadgeInfo {
  const normPhase = (phase || 'pre_processing').toLowerCase();

  switch (normPhase) {
    case 'pre_processing':
      return {
        label: 'Pre-processing',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/80 shadow-2xs',
        dotClass: 'bg-sky-500',
        Icon: Layers,
      };
    case 'processing':
      return {
        label: 'Processing',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 shadow-2xs',
        dotClass: 'bg-indigo-500',
        Icon: Zap,
      };
    case 'quality_assurance':
      return {
        label: 'Quality Assurance',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80 shadow-2xs',
        dotClass: 'bg-amber-500',
        Icon: ShieldCheck,
      };
    case 'completion':
      return {
        label: 'Completion',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs',
        dotClass: 'bg-emerald-500',
        Icon: CheckCircle2,
      };
    default:
      return {
        label: (phase || 'Unknown').replace('_', ' '),
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
        Icon: Clock,
      };
  }
}

export function getStatusBadgeInfo(status?: string | null): StatusBadgeInfo {
  const normStatus = (status || 'Draft').toLowerCase();

  switch (normStatus) {
    case 'completed':
      return {
        label: 'Completed',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs',
        dotClass: 'bg-emerald-500',
        Icon: CheckCircle2,
      };
    case 'in progress':
    case 'processing':
      return {
        label: 'In Progress',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs',
        dotClass: 'bg-blue-500',
        Icon: Zap,
      };
    case 'pre-processing':
      return {
        label: 'Pre-processing',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 shadow-2xs',
        dotClass: 'bg-sky-500',
        Icon: Layers,
      };
    case 'for review':
      return {
        label: 'For Review',
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 shadow-2xs',
        dotClass: 'bg-purple-500',
        Icon: Clock,
      };
    case 'billing':
      return {
        label: 'Billing',
        badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200 shadow-2xs',
        dotClass: 'bg-cyan-500',
        Icon: DollarSign,
      };
    case 'disbursement':
      return {
        label: 'Disbursement',
        badgeClass: 'bg-violet-50 text-violet-700 border-violet-200 shadow-2xs',
        dotClass: 'bg-violet-500',
        Icon: Receipt,
      };
    case 'on hold':
      return {
        label: 'On Hold',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 shadow-2xs',
        dotClass: 'bg-amber-500',
        Icon: PauseCircle,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs',
        dotClass: 'bg-rose-500',
        Icon: Ban,
      };
    case 'draft':
    default:
      return {
        label: status || 'Draft',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 shadow-2xs',
        dotClass: 'bg-slate-400',
        Icon: FileText,
      };
  }
}
