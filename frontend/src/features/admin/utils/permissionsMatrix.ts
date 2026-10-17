/**
 * Master Permissions Matrix & Calculation Engine
 *
 * Citations:
 * - docs/api-contracts/rbac-matrix.md (Contract Version 2.0.0)
 * - backend/src/lib/permissions.js
 * - frontend/src/lib/permissions.ts
 */

import { PERMISSION_KEYS, type PermissionKey } from '@/lib/permissions';
import type { DepartmentName, UserRole, AdminUser, UserEffectivePermissions } from '../api/types';

export const ALL_ROLES: UserRole[] = [
  'Admin',
  'Manager',
  'Accounting',
  'Operations',
  'Documentation',
  'HR',
];

export const ALL_DEPARTMENTS: DepartmentName[] = [
  'Management',
  'Accounting',
  'Operations',
  'Documentation',
  'HR',
];

export const DEPARTMENT_PERMISSIONS: Record<DepartmentName, readonly string[]> = {
  Management: [
    'clients:view',
    'workflow:view',
    'workflow:edit',
    'workflow:task_add',
    'workflow:task_approve',
    'billing:view',
    'billing:edit',
    'billing:delete',
    'billing:payments',
    'billing:templates',
    'billing:request',
    'billing:mark_paid',
    'disbursement:view',
    'disbursement:create',
    'disbursement:edit',
    'disbursement:request',
    'disbursement:mark_released',
    'dms:view',
    'dms:edit',
    'dms:delete',
    'dms:handover',
    'transmittal:view',
    'transmittal:create',
    'transmittal:edit',
    'transmittal:mark',
    'transmittal:delete',
    'reports:view',
    'bypass_review:tasks',
    'bypass_review:*',
    'approve_change:tasks',
    'approve_change:*',
    'users:view',
    'audit:view_all',
    'workflow:transition_request',
    'retainers:use',
    'billing:edit_client_address',
    'timelog:view',
    'timelog:create',
    'timelog:edit_own',
    'notifications:view',
  ],
  Accounting: [
    'clients:view',
    'workflow:view',
    'workflow:task_add',
    'billing:view',
    'billing:edit',
    'billing:delete',
    'billing:payments',
    'billing:templates',
    'disbursement:view',
    'disbursement:create',
    'disbursement:edit',
    'dms:view',
    'transmittal:view',
    'reports:view',
    'approve_change:invoices',
    'approve_change:disbursements',
    'billing:edit_client_address',
    'timelog:view',
    'timelog:create',
    'timelog:edit_own',
    'notifications:view',
  ],
  Operations: [
    'clients:view',
    'workflow:view',
    'workflow:task_add',
    'workflow:task_upload',
    'billing:view',
    'billing:request',
    'disbursement:view',
    'disbursement:request',
    'dms:view',
    'transmittal:view',
    'transmittal:request',
    'reports:view',
    'disbursement:create',
    'timelog:view',
    'timelog:create',
    'timelog:edit_own',
    'notifications:view',
  ],
  Documentation: [
    'clients:view',
    'workflow:view',
    'workflow:task_add',
    'billing:view',
    'disbursement:view',
    'dms:view',
    'dms:edit',
    'dms:delete',
    'dms:handover',
    'transmittal:view',
    'transmittal:create',
    'transmittal:edit',
    'transmittal:mark',
    'reports:view',
    'disbursement:create',
    'timelog:view',
    'timelog:create',
    'timelog:edit_own',
    'notifications:view',
  ],
  HR: [
    'clients:view',
    'workflow:view',
    'workflow:task_add',
    'workflow:task_upload',
    'billing:view',
    'billing:request',
    'disbursement:view',
    'disbursement:request',
    'dms:view',
    'transmittal:view',
    'transmittal:request',
    'reports:view',
    'disbursement:create',
    'timelog:view',
    'timelog:create',
    'timelog:edit_own',
    'notifications:view',
  ],
};

export const ADMIN_EXCLUSIVE_PERMISSIONS: readonly string[] = [
  'users:manage',
  'clients:edit',
  'transmittal:approve',
  'workflow:phase_transition',
  'workflow:qa_review',
  'retainers:edit',
  'disbursement:approve',
  'timelog:edit_all',
];

/**
 * Check if a permission set satisfies a given permission key.
 * Supports wildcards such as `approve_change:*` matching `approve_change:tasks`.
 */
export function testPermission(granted: Set<string>, required: string): boolean {
  if (granted.has(required)) return true;

  const parts = required.split(':');
  if (parts.length === 2 && parts[0]) {
    const wildcard = `${parts[0]}:*`;
    if (granted.has(wildcard)) return true;
  }

  return false;
}

/**
 * Compute the effective permission set and source trace for any user.
 */
export function computeUserEffectivePermissions(
  user: Pick<AdminUser, 'role' | 'departments'>
): UserEffectivePermissions {
  const granted = new Set<string>();
  const departmentSources: Record<string, DepartmentName[]> = {};
  const allowedDepts = new Set<DepartmentName>(ALL_DEPARTMENTS);

  const effectiveDepts: DepartmentName[] = (user.departments || []).filter(
    (dept): dept is DepartmentName => allowedDepts.has(dept as DepartmentName)
  );

  // Map legacy role name to department equivalent
  const legacyDept = (user.role === 'Manager' ? 'Management' : user.role) as DepartmentName;
  if (
    legacyDept &&
    allowedDepts.has(legacyDept) &&
    DEPARTMENT_PERMISSIONS[legacyDept] &&
    !effectiveDepts.includes(legacyDept)
  ) {
    effectiveDepts.push(legacyDept);
  }

  // Union department permissions
  for (const dept of effectiveDepts) {
    const deptPerms = DEPARTMENT_PERMISSIONS[dept] || [];
    for (const p of deptPerms) {
      granted.add(p);
      const sources = departmentSources[p] ?? [];
      if (!sources.includes(dept)) {
        sources.push(dept);
      }
      departmentSources[p] = sources;
    }
  }

  // Admin super-user privilege
  const isAdminSuperUser = user.role === 'Admin';
  if (isAdminSuperUser) {
    for (const dept of ALL_DEPARTMENTS) {
      const deptPerms = DEPARTMENT_PERMISSIONS[dept] || [];
      for (const p of deptPerms) {
        granted.add(p);
      }
    }
    for (const p of ADMIN_EXCLUSIVE_PERMISSIONS) {
      granted.add(p);
    }
  }

  return {
    user: user as AdminUser,
    effectivePermissions: Array.from(granted),
    departmentSources,
    isAdminSuperUser,
  };
}

/**
 * Group permission keys by functional module for table organization.
 */
export function getPermissionModule(key: string): string {
  const prefix = key.split(':')[0] || 'other';
  switch (prefix) {
    case 'workflow':
      return 'Workflow & Operations';
    case 'billing':
      return 'Billing & Invoices';
    case 'disbursement':
      return 'Disbursements';
    case 'transmittal':
      return 'Transmittals';
    case 'dms':
      return 'Document Management (DMS)';
    case 'timelog':
      return 'Time Entries';
    case 'retainers':
      return 'Retainer Templates';
    case 'users':
      return 'User Management';
    case 'clients':
      return 'Clients';
    case 'reports':
      return 'Reports';
    case 'audit':
      return 'Audit Logs';
    case 'notifications':
      return 'Notifications';
    case 'approve_change':
    case 'bypass_review':
      return 'Change Governance';
    default:
      return 'General';
  }
}

/**
 * Calculate the permission grant status for a specific role across all 52 keys.
 */
export function getPermissionsForRole(role: UserRole): Set<string> {
  return new Set(computeUserEffectivePermissions({ role, departments: [] }).effectivePermissions);
}

/**
 * Calculate the permission grant status for a specific department across all 52 keys.
 */
export function getPermissionsForDepartment(dept: DepartmentName): Set<string> {
  const granted = new Set<string>();
  const perms = DEPARTMENT_PERMISSIONS[dept] || [];
  for (const p of perms) {
    granted.add(p);
  }
  return granted;
}

export { PERMISSION_KEYS, type PermissionKey };
