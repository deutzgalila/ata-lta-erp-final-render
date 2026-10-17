/**
 * Centralized TanStack Query key factory for Transmittals (Module #5)
 *
 * Citation: Frozen API Contract transmittals@2.0.0 (docs/api-contracts/modules/transmittals.md)
 */

import type { TransmittalFilters } from './types';

export const transmittalKeys = {
  all: ['transmittals'] as const,
  lists: () => [...transmittalKeys.all, 'list'] as const,
  list: (entity: string | null, filters?: TransmittalFilters) =>
    [...transmittalKeys.lists(), entity, filters ?? {}] as const,
  details: () => [...transmittalKeys.all, 'detail'] as const,
  detail: (id: string | undefined) => [...transmittalKeys.details(), id ?? ''] as const,
  counts: (entity: string | null) => [...transmittalKeys.all, 'counts', entity] as const,
};
