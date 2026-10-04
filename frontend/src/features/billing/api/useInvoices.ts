import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { billingKeys } from './queryKeys';
import type {
  Invoice,
  InvoiceFilters,
  InvoiceListResponse,
  InvoiceCountsResponse,
} from './types';

export function useInvoices(
  filters?: InvoiceFilters,
  options?: { enabled?: boolean }
) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: billingKeys.invoicesList(activeEntity, filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'All') {
        params.append('status', filters.status);
      }
      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.linkedTaskId) params.append('linkedTaskId', filters.linkedTaskId);
      if (filters?.linkedTransmittalId) {
        params.append('linkedTransmittalId', filters.linkedTransmittalId);
      }
      if (filters?.search) params.append('search', filters.search);
      if (filters?.archived !== undefined) {
        params.append('archived', String(filters.archived));
      }
      if (filters?.includeDeleted !== undefined) {
        params.append('includeDeleted', String(filters.includeDeleted));
      }
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));

      const queryStr = params.toString();
      const path = `/invoices${queryStr ? `?${queryStr}` : ''}`;
      const res = await apiRequest<InvoiceListResponse>(path);
      return res;
    },
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

/** Alias to satisfy contract citations */
export const useInvoicesList = useInvoices;

export function useInvoiceDetail(
  id: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: billingKeys.invoiceDetail(id),
    queryFn: async () => {
      if (!id) throw new Error('Invoice ID required');
      const res = await apiRequest<{ data: Invoice }>(`/invoices/${id}`);
      return res.data;
    },
    enabled: !!id && (options?.enabled ?? true),
    staleTime: 30 * 1000,
  });
}

export function useInvoiceCounts(options?: { enabled?: boolean }) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: billingKeys.counts(activeEntity),
    queryFn: async () => {
      const res = await apiRequest<InvoiceCountsResponse>('/invoices/counts');
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}
