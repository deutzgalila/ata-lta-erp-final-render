import { useQuery } from '@tanstack/react-query';
import { apiRequest, type ApiError } from '@/lib/api';
import { useSessionStore } from '@/lib/session';

export interface ClientSummary {
  id: string;
  name: string;
  entity: 'ATA' | 'LTA';
  tin?: string | null;
  rdoCode?: string | null;
  address?: string | null;
  status?: string;
  retainer?: boolean;
}

export interface ClientListResponse {
  data: ClientSummary[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ClientFilters {
  entity?: string | null;
  search?: string;
  status?: string;
}

export function useClients(filters?: ClientFilters) {
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const effectiveEntity = filters?.entity ?? (activeEntity !== 'ALL' ? activeEntity : undefined);

  return useQuery<ClientSummary[], ApiError>({
    queryKey: ['clients', 'list', effectiveEntity, filters?.search, filters?.status],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (effectiveEntity) {
        searchParams.append('entity', effectiveEntity);
      }
      if (filters?.search) {
        searchParams.append('search', filters.search);
      }
      if (filters?.status) {
        searchParams.append('status', filters.status);
      }
      const queryStr = searchParams.toString();
      const path = `/clients${queryStr ? `?${queryStr}` : ''}`;
      const res = await apiRequest<ClientListResponse>(path);
      return res.data;
    },
    staleTime: 60 * 1000,
  });
}
