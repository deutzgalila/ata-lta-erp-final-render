/**
 * Constants and Display Labels for Documents (DMS) Module
 */

import type { DocumentCategory, DocumentLifecycle } from './api/types';

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  SEC: 'SEC Filings',
  BIR: 'BIR Taxes',
  CONTRACT: 'Contracts & Agreements',
  PERMIT: 'Permits & Clearances',
  FINANCIAL: 'Financial Statements',
  CORRESPONDENCE: 'Correspondence',
  LEGAL: 'Legal & Resolutions',
  HR: 'Human Resources',
  OTHER: 'Other / Miscellaneous',
};

export const LIFECYCLE_LABELS: Record<DocumentLifecycle, string> = {
  collected: 'Collected',
  with_documentations: 'With Documentations',
  scanned: 'Scanned',
  in_envelope: 'In Envelope',
  stored: 'Stored',
};

export const LIFECYCLE_BADGE_STYLES: Record<DocumentLifecycle, string> = {
  collected: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  with_documentations: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  scanned: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800',
  in_envelope: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  stored: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
};

export const CATEGORY_BADGE_STYLES: Record<DocumentCategory, string> = {
  SEC: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  BIR: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  CONTRACT: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
  PERMIT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  FINANCIAL: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800',
  CORRESPONDENCE: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  LEGAL: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  HR: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  OTHER: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};
