import { apiRequest } from '@/lib/api';
import { runBlockingAction } from '@/features/operations/components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';
import { billingKeys } from './queryKeys';
import type {
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  RecordPaymentInput,
  InvoicePayment,
} from './types';

// ============================================================================
// Direct Blocking Action Runners (Zero Optimistic Updates)
// ============================================================================

export async function createInvoiceAction(
  data: CreateInvoiceInput,
  activeEntity?: string | null
): Promise<Invoice> {
  return runBlockingAction<Invoice>({
    title: 'Creating Invoice',
    message: `Submitting invoice ${data.invoiceNumber} with ${data.lineItems.length} line item(s)...`,
    actionName: 'Create Invoice',
    apiCall: async () => {
      const res = await apiRequest<{ data: Invoice }>('/invoices', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.counts(activeEntity),
    ],
  });
}

export async function updateInvoiceAction(
  id: string,
  data: UpdateInvoiceInput,
  activeEntity?: string | null
): Promise<Invoice> {
  return runBlockingAction<Invoice>({
    title: 'Updating Invoice',
    message: 'Persisting invoice modifications to server...',
    actionName: 'Update Invoice',
    apiCall: async () => {
      const res = await apiRequest<{ data: Invoice }>(`/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.invoiceDetail(id),
      billingKeys.counts(activeEntity),
      billingKeys.aging(activeEntity),
    ],
  });
}

/**
 * Field-level secure address updater (P0-G §3.2 / AC-4, AC-5).
 * Updates the invoice snapshot address only. Master clients record remains immutable.
 */
export async function updateClientAddressAction(
  id: string,
  address: string,
  expectedVersion?: number,
  activeEntity?: string | null
): Promise<Invoice> {
  return runBlockingAction<Invoice>({
    title: 'Updating Invoice Client Address',
    message: 'Saving client address to invoice snapshot (master client record remains untouched)...',
    actionName: 'Update Client Address',
    successTitle: 'Address Snapshot Updated',
    successMessage: 'Updated invoice snapshot address only. Master client record remains unchanged.',
    apiCall: async () => {
      const payload: Record<string, unknown> = { address };
      if (expectedVersion !== undefined) {
        payload.expectedVersion = expectedVersion;
      }
      const res = await apiRequest<{ data: Invoice }>(`/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.invoiceDetail(id),
      billingKeys.counts(activeEntity),
    ],
  });
}

export async function deleteInvoiceAction(
  id: string,
  invoiceNumber?: string,
  activeEntity?: string | null
): Promise<void> {
  return runBlockingAction<void>({
    title: 'Deleting Invoice',
    message: `Soft deleting invoice ${invoiceNumber || id}...`,
    actionName: 'Delete Invoice',
    apiCall: async () => {
      await apiRequest<void>(`/invoices/${id}`, {
        method: 'DELETE',
      });
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.counts(activeEntity),
      billingKeys.aging(activeEntity),
    ],
  });
}

export async function archiveInvoiceAction(
  id: string,
  invoiceNumber?: string,
  activeEntity?: string | null
): Promise<Invoice> {
  return runBlockingAction<Invoice>({
    title: 'Archiving Invoice',
    message: `Moving invoice ${invoiceNumber || id} to archive...`,
    actionName: 'Archive Invoice',
    apiCall: async () => {
      const res = await apiRequest<{ data: Invoice }>(`/invoices/${id}/archive`, {
        method: 'POST',
      });
      return res.data;
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.invoiceDetail(id),
      billingKeys.counts(activeEntity),
      billingKeys.aging(activeEntity),
    ],
  });
}

export async function restoreInvoiceAction(
  id: string,
  invoiceNumber?: string,
  activeEntity?: string | null
): Promise<Invoice> {
  return runBlockingAction<Invoice>({
    title: 'Restoring Invoice',
    message: `Restoring invoice ${invoiceNumber || id} from archive...`,
    actionName: 'Restore Invoice',
    apiCall: async () => {
      const res = await apiRequest<{ data: Invoice }>(`/invoices/${id}/unarchive`, {
        method: 'POST',
      });
      return res.data;
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.invoiceDetail(id),
      billingKeys.counts(activeEntity),
      billingKeys.aging(activeEntity),
    ],
  });
}

export async function recordPaymentAction(
  invoiceId: string,
  data: RecordPaymentInput,
  activeEntity?: string | null
): Promise<InvoicePayment> {
  return runBlockingAction<InvoicePayment>({
    title: 'Recording Payment',
    message: `Recording payment of ₱${data.amount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
    })} via ${data.method}...`,
    actionName: 'Record Payment',
    successTitle: 'Payment Recorded',
    successMessage: `Successfully recorded payment of ₱${data.amount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
    })}.`,
    apiCall: async () => {
      const res = await apiRequest<{ data: InvoicePayment }>(
        `/invoices/${invoiceId}/payments`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    invalidateQueries: [
      billingKeys.invoices(),
      billingKeys.invoiceDetail(invoiceId),
      billingKeys.counts(activeEntity),
      billingKeys.aging(activeEntity),
    ],
  });
}

export async function fetchInvoicePdfUrl(id: string): Promise<string> {
  const res = await apiRequest<{ data: { url: string } }>(`/invoices/${id}/pdf`);
  return res.data.url;
}

export async function fetchVoucherPdfUrl(id: string): Promise<string> {
  const res = await apiRequest<{ data: { url: string } }>(`/invoices/${id}/voucher`);
  return res.data.url;
}

// ============================================================================
// React Hook
// ============================================================================

export function useBillingMutations() {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return {
    createInvoice: (data: CreateInvoiceInput) => createInvoiceAction(data, activeEntity),
    updateInvoice: (id: string, data: UpdateInvoiceInput) =>
      updateInvoiceAction(id, data, activeEntity),
    updateClientAddress: (id: string, address: string, expectedVersion?: number) =>
      updateClientAddressAction(id, address, expectedVersion, activeEntity),
    deleteInvoice: (id: string, invoiceNumber?: string) =>
      deleteInvoiceAction(id, invoiceNumber, activeEntity),
    archiveInvoice: (id: string, invoiceNumber?: string) =>
      archiveInvoiceAction(id, invoiceNumber, activeEntity),
    restoreInvoice: (id: string, invoiceNumber?: string) =>
      restoreInvoiceAction(id, invoiceNumber, activeEntity),
    recordPayment: (invoiceId: string, data: RecordPaymentInput) =>
      recordPaymentAction(invoiceId, data, activeEntity),
    fetchInvoicePdfUrl,
    fetchVoucherPdfUrl,
  };
}
