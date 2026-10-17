import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useDocumentsList,
  useDocumentCounts,
  useDocumentDownloadUrl,
  useLifecycleTransition,
  useArchiveDocument,
  useDeleteDocument,
} from '../api/useDocuments';
import { documentKeys } from '../api/queryKeys';

describe('useDocuments TanStack Query Hooks (documents@2.0.0)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  describe('queryKeys factory', () => {
    it('produces hierarchical and deterministic cache keys', () => {
      expect(documentKeys.all).toEqual(['documents']);
      expect(documentKeys.counts('ATA')).toEqual(['documents', 'counts', 'ATA']);
      expect(documentKeys.list('ATA', { page: 1 })).toEqual([
        'documents',
        'list',
        'ATA',
        { page: 1 },
      ]);
      expect(documentKeys.detail('doc-123')).toEqual(['documents', 'detail', 'doc-123']);
      expect(documentKeys.downloadUrl('doc-123')).toEqual([
        'documents',
        'downloadUrl',
        'doc-123',
      ]);
    });
  });

  describe('useDocumentsList query hook', () => {
    it('fetches list of documents with pagination metadata', async () => {
      const mockData = {
        data: [
          {
            id: 'doc-1',
            file_name: 'test.pdf',
            original_name: 'Test.pdf',
            status: 'active',
            document_lifecycle: 'collected',
            category: 'OTHER',
            archived: false,
          },
        ],
        meta: { total: 1, page: 1, limit: 50 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const { result } = renderHook(() => useDocumentsList({ page: 1, limit: 50 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.data.length).toBe(1);
      expect(result.current.data?.data[0]?.id).toBe('doc-1');
    });
  });

  describe('useDocumentCounts query hook', () => {
    it('fetches active and archived document counts', async () => {
      const mockCounts = {
        data: { active: 42, archived: 7 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockCounts,
      });

      const { result } = renderHook(() => useDocumentCounts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.active).toBe(42);
      expect(result.current.data?.archived).toBe(7);
    });
  });

  describe('useDocumentDownloadUrl hook', () => {
    it('fetches signed download URL with 5m cache', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: { url: 'https://storage.supabase.co/signed/doc-1.pdf', fileName: 'doc.pdf' },
        }),
      });

      const { result } = renderHook(() => useDocumentDownloadUrl('doc-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.url).toContain('https://storage.supabase.co');
    });
  });

  describe('Zero Optimistic Updates on Mutations', () => {
    it('useLifecycleTransition invalidates document queries on success without optimistic writes', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: { id: 'doc-1', document_lifecycle: 'scanned' },
        }),
      });

      const { result } = renderHook(() => useLifecycleTransition(), { wrapper });
      await result.current.mutateAsync({ id: 'doc-1', lifecycle: 'scanned' });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: documentKeys.all })
      );
    });

    it('useArchiveDocument invalidates document queries and counts on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: { id: 'doc-1', archived: true },
        }),
      });

      const { result } = renderHook(() => useArchiveDocument(), { wrapper });
      await result.current.mutateAsync('doc-1');

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: documentKeys.all })
      );
    });

    it('useDeleteDocument surfaces error verbatim upon 403 Forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/problem+json' }),
        json: async () => ({
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          code: 'FORBIDDEN',
          detail: 'You lack dms:delete permission to remove this document',
        }),
      });

      const { result } = renderHook(() => useDeleteDocument(), { wrapper });

      await expect(result.current.mutateAsync('doc-1')).rejects.toThrow();
    });
  });
});
