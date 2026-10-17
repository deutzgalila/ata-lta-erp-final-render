import type { AnalyticsQueryParams, AgingQueryParams } from './types';

/**
 * Centralized TanStack Query keys factory for reports@2.0.0.
 */
export const reportsKeys = {
  all: ['reports'] as const,

  analytics: (entity: string | null, params?: AnalyticsQueryParams) =>
    [...reportsKeys.all, 'analytics', entity, params ?? {}] as const,

  dashboard: (entity: string | null) =>
    [...reportsKeys.all, 'dashboard', entity] as const,

  daily: (entity: string | null, date: string) =>
    [...reportsKeys.all, 'daily', entity, date] as const,

  weekly: (entity: string | null, date: string) =>
    [...reportsKeys.all, 'weekly', entity, date] as const,

  monthlyPending: (entity: string | null, month?: string) =>
    [...reportsKeys.all, 'monthlyPending', entity, month ?? ''] as const,

  aging: (entity: string | null, params?: AgingQueryParams) =>
    [...reportsKeys.all, 'aging', entity, params ?? {}] as const,
};
