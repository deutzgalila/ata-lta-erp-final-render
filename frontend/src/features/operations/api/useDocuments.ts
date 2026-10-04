import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { operationsKeys } from './queryKeys';
import type {
  DmsDocument,
  DocumentFilterParams,
  DocumentComment,
  CreateDocumentInput,
} from './types';

// ============================================================================
// Queries
// ============================================================================

export function useDocuments(
  filterParams?: DocumentFilterParams | string,
  options?: { enabled?: boolean }
) {
  const params: DocumentFilterParams =
    typeof filterParams === 'string'
      ? { workRequestId: filterParams }
      : filterParams ?? {};

  return useQuery({
    queryKey: operationsKeys.documentsList(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.workRequestId) searchParams.append('workRequestId', params.workRequestId);
      if (params.linkedTaskId) searchParams.append('linkedTaskId', params.linkedTaskId);
      if (params.clientId) searchParams.append('clientId', params.clientId);
      if (params.category) searchParams.append('category', params.category);
      if (params.status) searchParams.append('status', params.status);
      if (params.search) searchParams.append('search', params.search);
      if (params.page) searchParams.append('page', String(params.page));
      if (params.limit) searchParams.append('limit', String(params.limit));

      const queryStr = searchParams.toString();
      const path = `/documents${queryStr ? `?${queryStr}` : ''}`;
      const res = await apiRequest<{ data: DmsDocument[]; meta?: { total: number } }>(path);
      return res;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useDocumentDownloadUrl(
  documentId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: operationsKeys.documentDownloadUrl(documentId ?? ''),
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');
      const res = await apiRequest<{
        data: { url: string; fileName: string; contentType?: string };
      }>(`/documents/${documentId}/download-url`);
      return res.data;
    },
    enabled: Boolean(documentId) && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Mutations (Zero Optimistic Updates Doctrine)
// ============================================================================

export interface UploadDocumentVariables {
  file: File;
  metadata?: CreateDocumentInput;
}

export interface UpdateCommentsVariables {
  documentId: string;
  comments: DocumentComment[];
}

export function useDocumentMutations() {
  const queryClient = useQueryClient();

  // 1. 3-step signed document upload
  const uploadMutation = useMutation<DmsDocument, ApiError, UploadDocumentVariables>({
    mutationFn: async ({ file, metadata = {} }) => {
      // Step 1: Create document metadata and get uploadUrl
      const initRes = await apiRequest<{
        data: {
          document: DmsDocument;
          uploadUrl?: string;
        };
      }>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          originalName: file.name,
          workRequestId: metadata.workRequestId,
          linkedTaskId: metadata.linkedTaskId,
          clientId: metadata.clientId,
          category: metadata.category ?? 'OTHER',
          description: metadata.description,
        }),
      });

      const { document, uploadUrl } = initRes.data;

      // Step 2: Upload binary directly to signed URL if provided
      if (uploadUrl) {
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new ApiError(
            uploadRes.status,
            uploadRes.statusText,
            'Failed to upload document binary to cloud storage'
          );
        }
      }

      // Step 3: Confirm storage upload completion
      const confirmRes = await apiRequest<{ data: DmsDocument }>(
        `/documents/${document.id}/confirm-upload`,
        {
          method: 'POST',
        }
      );

      return confirmRes.data;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.documents() });
      if (doc.workRequestId || doc.work_request_id) {
        const wrId = doc.workRequestId || doc.work_request_id;
        if (wrId) {
          queryClient.invalidateQueries({
            queryKey: operationsKeys.workRequestDetail(wrId),
          });
        }
      }
    },
  });

  // 2. Update comments
  const updateCommentsMutation = useMutation<
    DmsDocument,
    ApiError,
    UpdateCommentsVariables
  >({
    mutationFn: async ({ documentId, comments }) => {
      const res = await apiRequest<{ data: DmsDocument }>(
        `/documents/${documentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ comments }),
        }
      );
      return res.data;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.documents() });
      queryClient.invalidateQueries({
        queryKey: operationsKeys.documentDetail(doc.id),
      });
    },
  });

  // 3. Delete document
  const deleteMutation = useMutation<void, ApiError, { documentId: string }>({
    mutationFn: async ({ documentId }) => {
      await apiRequest<void>(`/documents/${documentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.documents() });
    },
  });

  return {
    uploadDocument: uploadMutation.mutateAsync,
    updateComments: async (
      arg1: string | UpdateCommentsVariables,
      comments?: DocumentComment[]
    ) => {
      const payload: UpdateCommentsVariables =
        typeof arg1 === 'string'
          ? { documentId: arg1, comments: comments! }
          : arg1;
      return updateCommentsMutation.mutateAsync(payload);
    },
    deleteDocument: async (arg: string | { documentId: string }) => {
      const payload = typeof arg === 'string' ? { documentId: arg } : arg;
      return deleteMutation.mutateAsync(payload);
    },
    uploadMutation,
    updateCommentsMutation,
    deleteMutation,
    isPending:
      uploadMutation.isPending ||
      updateCommentsMutation.isPending ||
      deleteMutation.isPending,
  };
}
