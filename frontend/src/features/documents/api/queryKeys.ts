/**
 * Centralized TanStack Query key factory for Documents (DMS) Module (Module #7)
 *
 * Citation: Frozen API Contract documents@2.0.0 (docs/api-contracts/modules/documents.md)
 */

import type { DocumentFilterParams } from './types';

export const documentKeys = {
  all: ['documents'] as const,
  counts: (entity?: string | null) =>
    [...documentKeys.all, 'counts', entity ?? 'ATA'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (entity?: string | null, filters?: DocumentFilterParams) =>
    [...documentKeys.lists(), entity ?? 'ATA', filters ?? {}] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: string | undefined) =>
    [...documentKeys.details(), id ?? ''] as const,
  downloadUrls: () => [...documentKeys.all, 'downloadUrl'] as const,
  downloadUrl: (id: string | undefined) =>
    [...documentKeys.downloadUrls(), id ?? ''] as const,
};
