import { useSessionStore } from './session';

/**
 * Master catalog of 52 concrete and wildcard permission keys.
 * Frozen at docs/api-contracts/rbac-matrix.md (Contract Version 2.0.0).
 */
export const PERMISSION_KEYS = [
  'approve_change:*',
  'approve_change:disbursements',
  'approve_change:invoices',
  'approve_change:tasks',
  'audit:view_all',
  'billing:delete',
  'billing:edit',
  'billing:edit_client_address',
  'billing:mark_paid',
  'billing:payments',
  'billing:request',
  'billing:templates',
  'billing:view',
  'bypass_review:*',
  'bypass_review:tasks',
  'clients:edit',
  'clients:view',
  'disbursement:approve',
  'disbursement:create',
  'disbursement:edit',
  'disbursement:mark_released',
  'disbursement:request',
  'disbursement:view',
  'dms:delete',
  'dms:edit',
  'dms:handover',
  'dms:view',
  'notifications:view',
  'reports:view',
  'retainers:edit',
  'retainers:use',
  'timelog:create',
  'timelog:edit_all',
  'timelog:edit_own',
  'timelog:view',
  'transmittal:approve',
  'transmittal:create',
  'transmittal:delete',
  'transmittal:edit',
  'transmittal:mark',
  'transmittal:request',
  'transmittal:view',
  'users:manage',
  'users:view',
  'workflow:edit',
  'workflow:phase_transition',
  'workflow:qa_review',
  'workflow:task_add',
  'workflow:task_approve',
  'workflow:task_upload',
  'workflow:transition_request',
  'workflow:view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * Check whether a granted permission set satisfies a required permission key.
 * Wildcard semantics (matching backend hasPermission in backend/src/lib/permissions.js):
 * - If required is in granted, return true.
 * - Split required on ':'; if 2 parts, check `<prefix>:*` in granted.
 */
export function hasPermission(
  granted: ReadonlySet<string> | readonly string[] | string[],
  required: PermissionKey | string
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has(required)) return true;

  const parts = required.split(':');
  if (parts.length === 2 && parts[0]) {
    const wildcard = `${parts[0]}:*`;
    if (set.has(wildcard)) return true;
  }

  return false;
}

/**
 * Hook to test if current session has the given permission.
 * Contract frozen per Spec §3.3: `(key: string) => boolean`.
 */
export function usePermission(key: PermissionKey | string): boolean {
  const permissions = useSessionStore((state) => state.permissions);
  return hasPermission(permissions, key);
}
