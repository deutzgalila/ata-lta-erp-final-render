import { describe, it, expect, beforeEach } from 'vitest';
import { hasPermission, usePermission, PERMISSION_KEYS } from '@/lib/permissions';
import { useSessionStore } from '@/lib/session';
import { renderHook, act } from '@testing-library/react';

describe('permissions catalog and wildcard parity (Spec §6, rbac-matrix.md)', () => {
  it('contains exactly 52 frozen permission keys from rbac-matrix.md v2.0.0', () => {
    expect(PERMISSION_KEYS.length).toBe(52);
    expect(PERMISSION_KEYS).toContain('approve_change:*');
    expect(PERMISSION_KEYS).toContain('bypass_review:*');
    expect(PERMISSION_KEYS).toContain('users:manage');
    expect(PERMISSION_KEYS).toContain('workflow:view');
    expect(PERMISSION_KEYS).toContain('billing:view');
    expect(PERMISSION_KEYS).toContain('disbursement:view');
  });

  describe('hasPermission wildcard logic', () => {
    it('returns true when exact key exists in granted permissions', () => {
      const granted = new Set(['workflow:view', 'billing:edit']);
      expect(hasPermission(granted, 'workflow:view')).toBe(true);
      expect(hasPermission(granted, 'billing:edit')).toBe(true);
      expect(hasPermission(granted, 'billing:delete')).toBe(false);
    });

    it('returns true when wildcard matches the prefix', () => {
      const granted = new Set(['approve_change:*']);
      expect(hasPermission(granted, 'approve_change:tasks')).toBe(true);
      expect(hasPermission(granted, 'approve_change:invoices')).toBe(true);
      expect(hasPermission(granted, 'approve_change:disbursements')).toBe(true);
      expect(hasPermission(granted, 'approve_change:any_new_action')).toBe(true);
    });

    it('returns true for bypass_review:* wildcard', () => {
      const granted = new Set(['bypass_review:*']);
      expect(hasPermission(granted, 'bypass_review:tasks')).toBe(true);
    });

    it('does NOT match unrelated prefixes with a wildcard', () => {
      const granted = new Set(['approve_change:*']);
      expect(hasPermission(granted, 'billing:view')).toBe(false);
      expect(hasPermission(granted, 'workflow:view')).toBe(false);
      expect(hasPermission(granted, 'disbursement:approve')).toBe(false);
    });

    it('returns false when key is missing and no wildcard matches', () => {
      const granted = new Set(['workflow:view', 'timelog:create']);
      expect(hasPermission(granted, 'users:manage')).toBe(false);
    });

    it('handles arrays as well as Sets for granted parameter', () => {
      const granted = ['workflow:view', 'approve_change:*'];
      expect(hasPermission(granted, 'workflow:view')).toBe(true);
      expect(hasPermission(granted, 'approve_change:tasks')).toBe(true);
      expect(hasPermission(granted, 'billing:view')).toBe(false);
    });

    it('handles malformed or invalid keys gracefully without throwing', () => {
      const granted = new Set(['workflow:view']);
      expect(hasPermission(granted, '')).toBe(false);
      expect(hasPermission(granted, 'singlepart')).toBe(false);
      expect(hasPermission(granted, 'a:b:c')).toBe(false);
    });
  });

  describe('RBAC matrix department parity test cases', () => {
    // Accounting: has approve_change:invoices & approve_change:disbursements, but NOT approve_change:tasks, NOT approve_change:*
    it('enforces Accounting department rules correctly', () => {
      const accountingPermissions = new Set([
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
      ]);

      expect(hasPermission(accountingPermissions, 'approve_change:invoices')).toBe(true);
      expect(hasPermission(accountingPermissions, 'approve_change:disbursements')).toBe(true);
      expect(hasPermission(accountingPermissions, 'approve_change:tasks')).toBe(false);
      expect(hasPermission(accountingPermissions, 'users:manage')).toBe(false);
      expect(hasPermission(accountingPermissions, 'workflow:phase_transition')).toBe(false);
      expect(hasPermission(accountingPermissions, 'billing:delete')).toBe(true);
    });

    // Management: has approve_change:*, bypass_review:*, audit:view_all, etc.
    it('enforces Management department rules with wildcards', () => {
      const managementPermissions = new Set([
        'clients:view',
        'workflow:view',
        'workflow:edit',
        'approve_change:*',
        'bypass_review:*',
        'audit:view_all',
        'users:view',
      ]);

      expect(hasPermission(managementPermissions, 'approve_change:tasks')).toBe(true);
      expect(hasPermission(managementPermissions, 'approve_change:invoices')).toBe(true);
      expect(hasPermission(managementPermissions, 'bypass_review:tasks')).toBe(true);
      expect(hasPermission(managementPermissions, 'users:view')).toBe(true);
      expect(hasPermission(managementPermissions, 'users:manage')).toBe(false); // Admin only
    });

    // Admin: super-user with users:manage, workflow:phase_transition, etc.
    it('enforces Admin super-user capabilities', () => {
      const adminPermissions = new Set(PERMISSION_KEYS);

      expect(hasPermission(adminPermissions, 'users:manage')).toBe(true);
      expect(hasPermission(adminPermissions, 'workflow:phase_transition')).toBe(true);
      expect(hasPermission(adminPermissions, 'workflow:qa_review')).toBe(true);
      expect(hasPermission(adminPermissions, 'retainers:edit')).toBe(true);
      expect(hasPermission(adminPermissions, 'disbursement:approve')).toBe(true);
    });
  });

  describe('usePermission hook', () => {
    beforeEach(() => {
      useSessionStore.getState().clearSession();
    });

    it('reads permissions directly from useSessionStore', () => {
      const { result, rerender } = renderHook(() => usePermission('workflow:view'));
      expect(result.current).toBe(false);

      act(() => {
        useSessionStore.getState().setSession({
          user: {
            id: 'test-1',
            email: 'test@example.com',
            name: 'Test',
            role: 'Operations',
            departments: ['Operations'],
            entities: ['ATA'],
          },
          permissions: ['workflow:view', 'approve_change:*'],
        });
      });

      rerender();
      expect(result.current).toBe(true);
    });

    it('resolves wildcards in usePermission hook', () => {
      act(() => {
        useSessionStore.getState().setSession({
          user: {
            id: 'test-1',
            email: 'test@example.com',
            name: 'Test',
            role: 'Manager',
            departments: ['Management'],
            entities: ['ATA'],
          },
          permissions: ['approve_change:*'],
        });
      });

      const { result } = renderHook(() => usePermission('approve_change:tasks'));
      expect(result.current).toBe(true);
    });
  });
});
