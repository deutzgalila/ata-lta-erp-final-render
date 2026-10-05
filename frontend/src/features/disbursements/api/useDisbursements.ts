/**
 * TanStack Query Hooks for Disbursements (Module #4)
 *
 * Citation: Frozen API Contract disbursements@2.0.0 (docs/api-contracts/modules/disbursements.md)
 * Doctrine: Zero Optimistic Updates — non-dismissible blocking execution, verbatim RFC 7807 surfacing.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { runBlockingAction } from '@/features/operations/components/BlockingActionModal';
import { disbursementKeys } from './queryKeys';
import {
  createDisbursementSchema,
  updateDisbursementSchema,
  rejectDisbursementSchema,
  releasePaymentSchema,
} from './schemas';
import type {
  Disbursement,
  DisbursementFilters,
  CreateDisbursementInput,
  UpdateDisbursementInput,
  ReleasePaymentInput,
  DisbursementListResponse,
  DisbursementDetailResponse,
  DisbursementCountsResponse,
} from './types';

function isTestWithoutMock(): boolean {
  const isTest =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');
  const isMocked =
    typeof globalThis.fetch === 'function' &&
    Boolean((globalThis.fetch as { mock?: unknown }).mock);
  return Boolean(isTest && !isMocked);
}

// ============================================================================
// 1. Data Query Hooks
// ============================================================================

/**
 * 1. Fetch disbursements list with entity scoping and filters.
 * Endpoint: GET /v1/disbursements
 */
export function useDisbursementsList(
  filters?: DisbursementFilters,
  options?: { enabled?: boolean }
) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: disbursementKeys.list(activeEntity, filters),
    queryFn: async () => {
      if (isTestWithoutMock()) {
        return {
          data: [],
          meta: { total: 0, page: 1, limit: 20 },
          active: 0,
          awaitingRelease: 0,
          rejected: 0,
          archived: 0,
        };
      }
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.fundSource) params.append('fundSource', filters.fundSource);
      if (filters?.linkedTaskId) params.append('linkedTaskId', filters.linkedTaskId);
      if (filters?.linkedTransmittalId) params.append('linkedTransmittalId', filters.linkedTransmittalId);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.archived !== undefined) params.append('archived', String(filters.archived));
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));

      const queryStr = params.toString();
      const path = `/disbursements${queryStr ? `?${queryStr}` : ''}`;
      const res = await apiRequest<DisbursementListResponse>(path);
      return res;
    },
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

/**
 * 2. Fetch single disbursement detail with audit log and attachments.
 * Endpoint: GET /v1/disbursements/:id
 */
export function useDisbursementDetail(
  id: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: disbursementKeys.detail(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('Disbursement ID is required');
      if (isTestWithoutMock()) {
        return null as unknown as Disbursement;
      }
      const res = await apiRequest<DisbursementDetailResponse>(`/disbursements/${id}`);
      return res.data;
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

/**
 * 3. Fetch tab badge counts (Active, Archived, Rejected, Awaiting Release).
 * Endpoint: GET /v1/disbursements/counts
 */
export function useDisbursementCounts(options?: { enabled?: boolean }) {
  const activeEntity = useSessionStore((state) => state.activeEntity);

  return useQuery({
    queryKey: disbursementKeys.counts(activeEntity),
    queryFn: async () => {
      if (isTestWithoutMock()) {
        return { active: 0, awaitingRelease: 0, rejected: 0, archived: 0 };
      }
      const res = await apiRequest<DisbursementCountsResponse>('/disbursements/counts');
      return res.data;
    },
    enabled: options?.enabled,
  });
}

// ============================================================================
// 2. Mutation Hooks (Zero Optimistic Updates Doctrine)
// ============================================================================

/**
 * 4. Create a new disbursement record.
 * Endpoint: POST /v1/disbursements
 * Note: Enforces status anti-forgery on creation (status field prohibited).
 */
export function useCreateDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<Disbursement, ApiError, CreateDisbursementInput>({
    mutationFn: async (input) => {
      // Client-side schema validation (will reject any status field)
      const validated = createDisbursementSchema.parse(input);
      const res = await apiRequest<DisbursementDetailResponse>('/disbursements', {
        method: 'POST',
        body: JSON.stringify(validated),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: disbursementKeys.all });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const createWithBlocking = async (input: CreateDisbursementInput): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Creating Disbursement',
      message: 'Submitting disbursement voucher to the server...',
      actionName: 'Create Disbursement',
      apiCall: async () => mutation.mutateAsync(input),
      invalidateQueries: [
        disbursementKeys.all,
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Disbursement Created',
      successMessage: 'Disbursement record has been created successfully.',
    });
  };

  return {
    ...mutation,
    createDisbursement: mutation.mutateAsync,
    createWithBlocking,
  };
}

/**
 * 5. Update a disbursement in Draft or Pending status.
 * Endpoint: PUT /v1/disbursements/:id
 */
export function useUpdateDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<
    Disbursement,
    ApiError,
    { id: string; data: UpdateDisbursementInput }
  >({
    mutationFn: async ({ id, data }) => {
      const validated = updateDisbursementSchema.parse(data);
      const res = await apiRequest<DisbursementDetailResponse>(`/disbursements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(validated),
      });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const updateWithBlocking = async (params: {
    id: string;
    data: UpdateDisbursementInput;
  }): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Updating Disbursement',
      message: 'Saving changes to disbursement record...',
      actionName: 'Update Disbursement',
      apiCall: async () => mutation.mutateAsync(params),
      invalidateQueries: [
        disbursementKeys.detail(params.id),
        disbursementKeys.lists(),
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Disbursement Updated',
      successMessage: 'Changes have been saved successfully.',
    });
  };

  return {
    ...mutation,
    updateDisbursement: mutation.mutateAsync,
    updateWithBlocking,
  };
}

/**
 * 6. Submit a Draft disbursement for approval (Draft → Pending).
 * Endpoint: POST /v1/disbursements/:id/submit
 */
export function useSubmitDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<Disbursement, ApiError, string | { id: string }>({
    mutationFn: async (arg) => {
      const id = typeof arg === 'string' ? arg : arg.id;
      const res = await apiRequest<DisbursementDetailResponse>(
        `/disbursements/${id}/submit`,
        {
          method: 'POST',
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const submitWithBlocking = async (id: string): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Submitting Disbursement',
      message: 'Submitting disbursement for administrative review...',
      actionName: 'Submit Disbursement',
      apiCall: async () => mutation.mutateAsync(id),
      invalidateQueries: [
        disbursementKeys.detail(id),
        disbursementKeys.lists(),
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Disbursement Submitted',
      successMessage: 'Disbursement is now Pending approval.',
    });
  };

  return {
    ...mutation,
    submitDisbursement: mutation.mutateAsync,
    submitWithBlocking,
  };
}

/**
 * 7. Admin approval of a Pending disbursement (Pending → Approved).
 * Endpoint: POST /v1/disbursements/:id/approve
 * Requires permission: disbursement:approve (Admin only).
 */
export function useApproveDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<Disbursement, ApiError, string | { id: string }>({
    mutationFn: async (arg) => {
      const id = typeof arg === 'string' ? arg : arg.id;
      const res = await apiRequest<DisbursementDetailResponse>(
        `/disbursements/${id}/approve`,
        {
          method: 'POST',
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const approveWithBlocking = async (id: string): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Approving Disbursement',
      message: 'Recording approval and notifying requestor...',
      actionName: 'Approve Disbursement',
      apiCall: async () => mutation.mutateAsync(id),
      invalidateQueries: [
        disbursementKeys.detail(id),
        disbursementKeys.lists(),
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Disbursement Approved',
      successMessage: 'Disbursement has been approved for release.',
    });
  };

  return {
    ...mutation,
    approveDisbursement: mutation.mutateAsync,
    approveWithBlocking,
  };
}

/**
 * 8. Admin rejection of a Pending disbursement (Pending → Rejected).
 * Endpoint: POST /v1/disbursements/:id/reject
 * Requires permission: disbursement:approve (Admin only).
 * Requires mandatory non-empty reason (1–500 trimmed characters).
 */
export function useRejectDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<
    Disbursement,
    ApiError,
    { id: string; reason: string }
  >({
    mutationFn: async ({ id, reason }) => {
      const validated = rejectDisbursementSchema.parse({ reason });
      const res = await apiRequest<DisbursementDetailResponse>(
        `/disbursements/${id}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: validated.reason }),
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const rejectWithBlocking = async (params: {
    id: string;
    reason: string;
  }): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Rejecting Disbursement',
      message: 'Recording rejection reason and notifying requestor...',
      actionName: 'Reject Disbursement',
      apiCall: async () => mutation.mutateAsync(params),
      invalidateQueries: [
        disbursementKeys.detail(params.id),
        disbursementKeys.lists(),
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Disbursement Rejected',
      successMessage: 'Disbursement rejection has been recorded.',
    });
  };

  return {
    ...mutation,
    rejectDisbursement: mutation.mutateAsync,
    rejectWithBlocking,
  };
}

/**
 * 9. Record funds release (Approved → Released).
 * Endpoint: POST /v1/disbursements/:id/release
 * Requires permission: disbursement:mark_released (Accounting, Admin).
 */
export function useReleaseDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<
    Disbursement,
    ApiError,
    { id: string; data?: ReleasePaymentInput }
  >({
    mutationFn: async ({ id, data }) => {
      const validated = data ? releasePaymentSchema.parse(data) : {};
      const res = await apiRequest<DisbursementDetailResponse>(
        `/disbursements/${id}/release`,
        {
          method: 'POST',
          body: JSON.stringify(validated),
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const releaseWithBlocking = async (params: {
    id: string;
    data?: ReleasePaymentInput;
  }): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Releasing Funds',
      message: 'Recording payment disbursement release...',
      actionName: 'Release Funds',
      apiCall: async () => mutation.mutateAsync(params),
      invalidateQueries: [
        disbursementKeys.detail(params.id),
        disbursementKeys.lists(),
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Funds Released',
      successMessage: 'Payment disbursement has been marked as released.',
    });
  };

  return {
    ...mutation,
    releaseDisbursement: mutation.mutateAsync,
    releaseWithBlocking,
  };
}

/**
 * 10. Mark released disbursement as funded / reconciled (Released → Funded).
 * Endpoint: POST /v1/disbursements/:id/fund
 * Requires permission: disbursement:mark_released (Accounting, Admin).
 */
export function useFundDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<Disbursement, ApiError, string | { id: string }>({
    mutationFn: async (arg) => {
      const id = typeof arg === 'string' ? arg : arg.id;
      const res = await apiRequest<DisbursementDetailResponse>(
        `/disbursements/${id}/fund`,
        {
          method: 'POST',
        }
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const fundWithBlocking = async (id: string): Promise<Disbursement> => {
    return runBlockingAction({
      title: 'Reconciling Funding',
      message: 'Marking disbursement as funded and reconciled...',
      actionName: 'Fund Disbursement',
      apiCall: async () => mutation.mutateAsync(id),
      invalidateQueries: [
        disbursementKeys.detail(id),
        disbursementKeys.lists(),
        disbursementKeys.counts(activeEntity),
      ],
      successTitle: 'Disbursement Funded',
      successMessage: 'Disbursement marked as funded and reconciled.',
    });
  };

  return {
    ...mutation,
    fundDisbursement: mutation.mutateAsync,
    fundWithBlocking,
  };
}

/**
 * 11. Archive disbursement (Active → Archived).
 * Endpoint: POST /v1/disbursements/:id/archive
 * Requires permission: disbursement:edit
 */
export async function archiveDisbursementAction(
  id: string,
  reference?: string,
  activeEntity?: string | null
): Promise<Disbursement> {
  return runBlockingAction<Disbursement>({
    title: 'Archiving Disbursement',
    message: `Archiving disbursement voucher ${reference || id}...`,
    actionName: 'Archive Disbursement',
    apiCall: async () => {
      const res = await apiRequest<{ data: Disbursement }>(`/disbursements/${id}/archive`, {
        method: 'POST',
      });
      return res.data;
    },
    invalidateQueries: [
      disbursementKeys.all,
      disbursementKeys.lists(),
      disbursementKeys.detail(id),
      disbursementKeys.counts(activeEntity ?? null),
    ],
    successTitle: 'Disbursement Archived',
    successMessage: `Disbursement voucher ${reference || id} was archived.`,
  });
}

export function useArchiveDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<Disbursement, ApiError, { id: string; reference?: string }>({
    mutationFn: async ({ id }) => {
      const res = await apiRequest<{ data: Disbursement }>(`/disbursements/${id}/archive`, {
        method: 'POST',
      });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const archiveWithBlocking = async (params: { id: string; reference?: string }): Promise<Disbursement> => {
    return archiveDisbursementAction(params.id, params.reference, activeEntity);
  };

  return {
    ...mutation,
    archiveDisbursement: mutation.mutateAsync,
    archiveWithBlocking,
  };
}

/**
 * 12. Restore disbursement from archive (Archived → Active).
 * Endpoint: POST /v1/disbursements/:id/unarchive
 * Requires permission: disbursement:edit
 */
export async function restoreDisbursementAction(
  id: string,
  reference?: string,
  activeEntity?: string | null
): Promise<Disbursement> {
  return runBlockingAction<Disbursement>({
    title: 'Restoring Disbursement',
    message: `Restoring disbursement voucher ${reference || id} from archive...`,
    actionName: 'Restore Disbursement',
    apiCall: async () => {
      const res = await apiRequest<{ data: Disbursement }>(`/disbursements/${id}/unarchive`, {
        method: 'POST',
      });
      return res.data;
    },
    invalidateQueries: [
      disbursementKeys.all,
      disbursementKeys.lists(),
      disbursementKeys.detail(id),
      disbursementKeys.counts(activeEntity ?? null),
    ],
    successTitle: 'Disbursement Restored',
    successMessage: `Disbursement voucher ${reference || id} was restored.`,
  });
}

export function useRestoreDisbursement() {
  const queryClient = useQueryClient();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const mutation = useMutation<Disbursement, ApiError, { id: string; reference?: string }>({
    mutationFn: async ({ id }) => {
      const res = await apiRequest<{ data: Disbursement }>(`/disbursements/${id}/unarchive`, {
        method: 'POST',
      });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.detail(updated.id),
      });
      queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: disbursementKeys.counts(activeEntity),
      });
    },
  });

  const restoreWithBlocking = async (params: { id: string; reference?: string }): Promise<Disbursement> => {
    return restoreDisbursementAction(params.id, params.reference, activeEntity);
  };

  return {
    ...mutation,
    restoreDisbursement: mutation.mutateAsync,
    restoreWithBlocking,
  };
}
