import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { operationsKeys } from './queryKeys';
import type {
  RetainerTemplate,
  CreateRetainerTemplateInput,
  RetainerGenerateOverrides,
  RetainerGenerateResponse,
} from './types';

// ============================================================================
// Queries
// ============================================================================

export function useRetainerTemplates(options?: { enabled?: boolean }) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: operationsKeys.templatesList(activeEntity),
    queryFn: async () => {
      const res = await apiRequest<{ data: RetainerTemplate[] }>(
        '/operations/templates'
      );
      return res.data;
    },
    enabled: options?.enabled ?? true,
  });
}

// ============================================================================
// Mutations (Zero Optimistic Updates Doctrine)
// ============================================================================

export interface GenerateRetainerVariables {
  templateId: string;
  period_label?: string | null;
  periodLabel?: string | null;
  overrides?: RetainerGenerateOverrides;
}

export function useRetainerMutations() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  // 1. Generate WR from Template (POST /v1/operations/templates/:id/generate)
  const generateMutation = useMutation<
    RetainerGenerateResponse,
    ApiError,
    GenerateRetainerVariables
  >({
    mutationFn: async ({ templateId, period_label, periodLabel, overrides }) => {
      const label = period_label ?? periodLabel ?? undefined;
      const res = await apiRequest<{ data: RetainerGenerateResponse }>(
        `/operations/templates/${templateId}/generate`,
        {
          method: 'POST',
          body: JSON.stringify({ period_label: label, overrides }),
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.workRequestCounts(activeEntity),
      });
    },
  });

  // 2. Admin Create Template (POST /v1/operations/templates)
  const createMutation = useMutation<
    RetainerTemplate,
    ApiError,
    CreateRetainerTemplateInput
  >({
    mutationFn: async (data) => {
      const res = await apiRequest<{ data: RetainerTemplate }>(
        '/operations/templates',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.templates() });
    },
  });

  // 3. Admin Update Template (PUT /v1/operations/templates/:id)
  const updateMutation = useMutation<
    RetainerTemplate,
    ApiError,
    { id: string; data: Partial<CreateRetainerTemplateInput> }
  >({
    mutationFn: async ({ id, data }) => {
      const res = await apiRequest<{ data: RetainerTemplate }>(
        `/operations/templates/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.templates() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.templateDetail(updated.id),
      });
    },
  });

  // 4. Admin Delete Template (DELETE /v1/operations/templates/:id)
  const deleteMutation = useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiRequest<void>(`/operations/templates/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.templates() });
    },
  });

  return {
    generateFromTemplate: generateMutation.mutateAsync,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: async (arg: string | { id: string }) => {
      const payload = typeof arg === 'string' ? { id: arg } : arg;
      return deleteMutation.mutateAsync(payload);
    },
    generateMutation,
    createMutation,
    updateMutation,
    deleteMutation,
    isPending:
      generateMutation.isPending ||
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
  };
}

// Combined facade supporting PROJECT.md interface contract
export function useRetainers() {
  const mutations = useRetainerMutations();

  return {
    useTemplates: useRetainerTemplates,
    generateFromTemplate: mutations.generateFromTemplate,
    ...mutations,
  };
}
