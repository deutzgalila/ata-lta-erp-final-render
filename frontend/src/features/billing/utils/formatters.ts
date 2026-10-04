import type { InvoiceStatus } from '../api/types';

export function formatCurrency(amount: number | undefined | null): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getStatusBadgeVariant(status: InvoiceStatus) {
  switch (status) {
    case 'Draft':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'Pending':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'Approved':
    case 'Sent':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'Partially Paid':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'Paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'Overdue':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'Cancelled':
      return 'bg-gray-100 text-gray-500 border-gray-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

/**
 * Auto-generate next sequential invoice number per erp_prototype/js/utils.js:244-269.
 * Format: ${entity}-SI-${year}-${paddedSequence} (e.g., ATA-SI-2026-001)
 */
export function getNextInvoiceNumber(
  entity: string | null | undefined,
  existingInvoices?: Array<{ invoice_number?: string; invoiceNumber?: string }>
): string {
  let resolvedEntity = entity;
  if (!resolvedEntity || resolvedEntity === 'ALL') {
    resolvedEntity = 'ATA';
  }
  const year = new Date().getFullYear();
  const prefix = `${resolvedEntity}-SI-${year}-`;
  const maxNum = (existingInvoices || []).reduce((max, inv) => {
    const numStr = inv.invoice_number || inv.invoiceNumber || '';
    if (!numStr.startsWith(prefix)) return max;
    const parts = numStr.split('-');
    const lastPart = parts[parts.length - 1];
    const num = lastPart ? parseInt(lastPart, 10) : 0;
    return !isNaN(num) && num > max ? num : max;
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}
