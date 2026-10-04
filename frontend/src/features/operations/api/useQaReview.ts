import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { operationsKeys } from './queryKeys';
import type {
  WorkRequest,
  QaReviewResultItem,
  RerouteResponse,
} from './types';

export interface QaReviewVariables {
  workRequestId?: string;
  results: QaReviewResultItem[];
}

export interface RerouteVariables {
  workRequestId?: string;
  to_phase: 'pre_processing' | 'processing';
  reason: string;
}

export function useQaReview(boundWorkRequestId?: string) {
  const queryClient = useQueryClient();

  // 1. Submit QA Review (POST /v1/operations/work-requests/:id/qa-review)
  const qaReviewMutation = useMutation<WorkRequest, ApiError, QaReviewVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, results }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      const res = await apiRequest<{ data: WorkRequest }>(
        `/operations/work-requests/${workRequestId}/qa-review`,
        {
          method: 'POST',
          body: JSON.stringify({ results }),
        }
      );
      return res.data;
    },
    onSuccess: (updatedWr, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId || updatedWr.id;
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
    },
  });

  // 2. Submit Reroute (POST /v1/operations/work-requests/:id/reroute)
  const rerouteMutation = useMutation<RerouteResponse, ApiError, RerouteVariables>({
    mutationFn: async ({ workRequestId = boundWorkRequestId, to_phase, reason }) => {
      if (!workRequestId) throw new Error('Work request ID is required');
      if (!reason || !reason.trim()) {
        throw new ApiError(
          400,
          'Bad Request',
          'Reroute reason is required',
          'VALIDATION_ERROR'
        );
      }
      const res = await apiRequest<{ data: RerouteResponse }>(
        `/operations/work-requests/${workRequestId}/reroute`,
        {
          method: 'POST',
          body: JSON.stringify({ to_phase, reason: reason.trim() }),
        }
      );
      return res.data;
    },
    onSuccess: (data, variables) => {
      const wrId = variables.workRequestId || boundWorkRequestId || data.id;
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequestDetail(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.tasks(wrId) });
      queryClient.invalidateQueries({ queryKey: operationsKeys.workRequests() });
    },
  });

  return {
    submitQaReview: async (arg: QaReviewResultItem[] | QaReviewVariables) => {
      const payload: QaReviewVariables = Array.isArray(arg)
        ? { workRequestId: boundWorkRequestId, results: arg }
        : { workRequestId: boundWorkRequestId, ...arg };
      return qaReviewMutation.mutateAsync(payload);
    },
    submitReroute: async (arg: RerouteVariables) => {
      const payload: RerouteVariables = {
        workRequestId: boundWorkRequestId,
        ...arg,
      };
      return rerouteMutation.mutateAsync(payload);
    },
    qaReviewMutation,
    rerouteMutation,
    isPending: qaReviewMutation.isPending || rerouteMutation.isPending,
  };
}
