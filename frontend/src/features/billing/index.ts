/**
 * Billing Feature Module Public Entry Point
 *
 * Exposes InvoiceCreateModal and FinancialPrefill integration contract (UAT2-7-contract-side)
 * for W2-OPS TaskDetailModal and cross-module deep links.
 */

export * from './api';
export * from './components';
export { InvoiceCreateModal, SUPPORT_TASK_ID_PAYLOAD } from './components/InvoiceCreateModal';
export type {
  InvoiceCreateModalProps,
  FinancialPrefill,
} from './components/InvoiceCreateModal';
