/**
 * Query Key Factory for Admin & Retainer Templates (Module #6)
 *
 * Provides strictly scoped, hierarchical cache keys for TanStack Query.
 */

export const adminKeys = {
  all: ['admin'] as const,

  // User management query keys
  users: (entity?: string | null) => ['admin', 'users', entity ?? 'ALL'] as const,
  allUsers: () => ['admin', 'users'] as const,
  userDetail: (id: string) => ['admin', 'users', 'detail', id] as const,

  // Audit query keys
  audit: (params?: Record<string, unknown>) => ['admin', 'audit', params ?? {}] as const,
  auditCount: (entity?: string | null) => ['admin', 'audit', 'count', entity ?? 'ALL'] as const,
  retainerGenerations: (entity?: string | null, page?: number, limit?: number) =>
    ['admin', 'audit', 'retainer_template_generations', entity ?? 'ALL', page ?? 1, limit ?? 20] as const,
  allRetainerGenerations: () => ['admin', 'audit', 'retainer_template_generations'] as const,

  // Retainer templates query keys (scoped under operations namespace for cross-module invalidation)
  templates: (entity?: string | null) => ['operations', 'templates', entity ?? 'ALL'] as const,
  allTemplates: () => ['operations', 'templates'] as const,
  templateDetail: (id: string) => ['operations', 'templates', 'detail', id] as const,
};
