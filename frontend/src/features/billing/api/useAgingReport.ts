import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { billingKeys } from './queryKeys';
import type { AgingReportData, AgingReportResponse } from './types';

export function useAgingReport(options?: { enabled?: boolean }) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery<AgingReportData>({
    queryKey: billingKeys.aging(activeEntity),
    queryFn: async () => {
      const res = await apiRequest<AgingReportResponse>('/invoices/aging');
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}
