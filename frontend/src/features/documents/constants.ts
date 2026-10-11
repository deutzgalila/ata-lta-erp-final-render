/**
 * Constants and Display Labels for Documents (DMS) Module
 */

import type { DocumentCategory, DocumentLifecycle } from './api/types';

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  'Owner Details': 'Owner Details',
  'Business Details': 'Business Details',
  SEC: 'SEC',
  'City Hall': 'City Hall',
  BIR: 'BIR',
  SSS: 'SSS',
  PhilHealth: 'PhilHealth',
  'Pag-IBIG': 'Pag-IBIG',
  IPO: 'IPO',
  FDA: 'FDA',
  Labor: 'Labor',
  Others: 'Others',
  // Backward compatibility labels for existing records
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
  collected: 'bg-amber-100 text-amber-800 border-amber-200',
  with_documentations: 'bg-blue-100 text-blue-800 border-blue-200',
  scanned: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  in_envelope: 'bg-teal-100 text-teal-800 border-teal-200',
  stored: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export const CATEGORY_BADGE_STYLES: Record<DocumentCategory, string> = {
  'Owner Details': 'bg-blue-50 text-blue-700 border-blue-200',
  'Business Details': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SEC: 'bg-blue-50 text-blue-700 border-blue-200',
  'City Hall': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  BIR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SSS: 'bg-amber-50 text-amber-700 border-amber-200',
  PhilHealth: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Pag-IBIG': 'bg-rose-50 text-rose-700 border-rose-200',
  IPO: 'bg-purple-50 text-purple-700 border-purple-200',
  FDA: 'bg-teal-50 text-teal-700 border-teal-200',
  Labor: 'bg-orange-50 text-orange-700 border-orange-200',
  Others: 'bg-slate-100 text-slate-700 border-slate-200',
  // Backward compatibility badge styles for existing records
  CONTRACT: 'bg-violet-50 text-violet-700 border-violet-200',
  PERMIT: 'bg-amber-50 text-amber-700 border-amber-200',
  FINANCIAL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  CORRESPONDENCE: 'bg-slate-100 text-slate-700 border-slate-200',
  LEGAL: 'bg-purple-50 text-purple-700 border-purple-200',
  HR: 'bg-rose-50 text-rose-700 border-rose-200',
  OTHER: 'bg-slate-100 text-slate-700 border-slate-200',
};
