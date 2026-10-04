import { useQuery } from '@tanstack/react-query';
import { apiRequest, type ApiError } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { adminKeys } from './queryKeys';
import type { AuditLogResponse } from './types';

export interface UseRetainerGenerationsOptions {
  page?: number;
  limit?: number;
  entity?: string | null;
  enabled?: boolean;
}

export function useRetainerGenerationsList(options?: UseRetainerGenerationsOptions) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;
  const offset = (page - 1) * limit;

  const activeEntity = useSessionStore((state) => state.activeEntity);
  const effectiveEntity = options?.entity ?? (activeEntity !== 'ALL' ? activeEntity : undefined);

  return useQuery<AuditLogResponse, ApiError>({
    queryKey: adminKeys.retainerGenerations(effectiveEntity, page, limit),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.append('table', 'retainer_template_generations');
      searchParams.append('limit', String(limit));
      searchParams.append('offset', String(offset));

      const path = `/admin/audit?${searchParams.toString()}`;
      return await apiRequest<AuditLogResponse>(path);
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useAuditCount(options?: { entity?: string | null; enabled?: boolean }) {
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const effectiveEntity = options?.entity ?? (activeEntity !== 'ALL' ? activeEntity : undefined);

  return useQuery<{ total: number }, ApiError>({
    queryKey: adminKeys.auditCount(effectiveEntity),
    queryFn: async () => {
      const res = await apiRequest<{ data: { total: number } }>('/admin/audit/count');
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}
