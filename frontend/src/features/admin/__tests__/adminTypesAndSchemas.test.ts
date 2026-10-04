import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  userPasswordSchema,
  createRetainerTemplateSchema,
  retainerTemplateTaskSchema,
  generateRetainerTemplateSchema,
  auditLogResponseSchema,
  problemDetailsSchema,
} from '../api/schemas';
import { generateSecurePassword, PASSWORD_CRITERIA } from '../utils/password';
import {
  computeUserEffectivePermissions,
  getPermissionModule,
  PERMISSION_KEYS,
  ADMIN_EXCLUSIVE_PERMISSIONS,
  testPermission,
} from '../utils/permissionsMatrix';
import type { AdminUser } from '../api/types';

describe('Admin Module: Types & Zod Schemas', () => {
  describe('Password Complexity Schema (Spec 2.8 / R-14)', () => {
    it('validates a compliant complex password', () => {
      const res = userPasswordSchema.safeParse('SecretP@ss123');
      expect(res.success).toBe(true);
    });

    it('rejects password shorter than 8 characters', () => {
      const res = userPasswordSchema.safeParse('Sh0rt!');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('at least 8 characters');
      }
    });

    it('rejects password without uppercase letter', () => {
      const res = userPasswordSchema.safeParse('lowercase123!');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('uppercase letter');
      }
    });

    it('rejects password without lowercase letter', () => {
      const res = userPasswordSchema.safeParse('UPPERCASE123!');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('lowercase letter');
      }
    });

    it('rejects password without number', () => {
      const res = userPasswordSchema.safeParse('NoNumberHere!');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('number');
      }
    });

    it('rejects password without special character', () => {
      const res = userPasswordSchema.safeParse('NoSpecialChar123');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('special character');
      }
    });
  });

  describe('Random Password Generator', () => {
    it('generates a 16-character password satisfying all 5 criteria', () => {
      for (let i = 0; i < 20; i++) {
        const pwd = generateSecurePassword(16);
        expect(pwd.length).toBe(16);
        for (const crit of PASSWORD_CRITERIA) {
          expect(crit.test(pwd)).toBe(true);
        }
        const schemaRes = userPasswordSchema.safeParse(pwd);
        expect(schemaRes.success).toBe(true);
      }
    });
  });

  describe('User Creation & Update Schemas', () => {
    it('validates a complete valid user creation payload', () => {
      const input = {
        name: 'Maria Santos',
        email: 'maria@ata-lta.ph',
        role: 'Operations',
        departments: ['Operations'],
        entities: ['ATA', 'LTA'],
        isActive: true,
        password: 'ValidP@ssword123',
      };
      const res = createUserSchema.safeParse(input);
      expect(res.success).toBe(true);
    });

    it('rejects creation without at least one entity', () => {
      const input = {
        name: 'Maria Santos',
        email: 'maria@ata-lta.ph',
        role: 'Operations',
        departments: ['Operations'],
        entities: [],
      };
      const res = createUserSchema.safeParse(input);
      expect(res.success).toBe(false);
    });

    it('rejects invalid email address', () => {
      const input = {
        name: 'Maria Santos',
        email: 'not-an-email',
        role: 'Operations',
        entities: ['ATA'],
      };
      const res = createUserSchema.safeParse(input);
      expect(res.success).toBe(false);
    });

    it('allows partial update schema for user edits', () => {
      const res = updateUserSchema.safeParse({
        name: 'Maria Santos-Reyes',
        departments: ['Operations', 'Documentation'],
      });
      expect(res.success).toBe(true);
    });
  });

  describe('Retainer Template Task & Template Schemas', () => {
    it('validates task blueprint with pre_processing and processing phases', () => {
      const preTask = {
        title: 'Review Client Ledger',
        phase: 'pre_processing',
        default_assignees: ['c56a4180-65aa-42ec-a945-5fd2dec05382'],
      };
      const procTask = {
        title: 'Compute Tax Withholding',
        phase: 'processing',
        depends_on_local_id: 'task_1',
      };

      expect(retainerTemplateTaskSchema.safeParse(preTask).success).toBe(true);
      expect(retainerTemplateTaskSchema.safeParse(procTask).success).toBe(true);
    });

    it('strictly rejects tasks with invalid phases (P0-D phase model constraint)', () => {
      const qaTask = {
        title: 'QA Review',
        phase: 'quality_assurance',
      };
      const compTask = {
        title: 'Final Signoff',
        phase: 'completion',
      };
      const arbitraryTask = {
        title: 'Random Step',
        phase: 'arbitrary_phase',
      };

      expect(retainerTemplateTaskSchema.safeParse(qaTask).success).toBe(false);
      expect(retainerTemplateTaskSchema.safeParse(compTask).success).toBe(false);
      expect(retainerTemplateTaskSchema.safeParse(arbitraryTask).success).toBe(false);
    });

    it('validates retainer template with recurrence none and annual', () => {
      const noneTemplate = {
        name: 'Ad-Hoc Advisory Retainer',
        recurrence: 'none',
        priority: 'Normal',
        pfAmount: 25000,
        tasks: [{ title: 'Advisory Memo', phase: 'pre_processing' }],
      };
      const annualTemplate = {
        name: 'Annual Audit Compliance',
        recurrence: 'annual',
        schedule: 'annual',
        tasks: [{ title: 'Audit Planning', phase: 'pre_processing' }],
      };

      expect(createRetainerTemplateSchema.safeParse(noneTemplate).success).toBe(true);
      expect(createRetainerTemplateSchema.safeParse(annualTemplate).success).toBe(true);
    });

    it('rejects invalid recurrence frequency', () => {
      const res = createRetainerTemplateSchema.safeParse({
        name: 'Invalid Template',
        recurrence: 'weekly',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('Retainer Generation Schema & Conflict Handling', () => {
    it('validates generation payload with period_label and overrides', () => {
      const input = {
        period_label: 'FY-2026',
        overrides: {
          title: 'Specialized 2026 Audit',
          priority: 'Urgent',
        },
      };
      const res = generateRetainerTemplateSchema.safeParse(input);
      expect(res.success).toBe(true);
    });

    it('validates RFC 7807 problem details schema', () => {
      const conflictError = {
        status: 409,
        title: 'Conflict',
        code: 'PERIOD_ALREADY_GENERATED',
        detail: 'Period already generated for this template',
      };
      const res = problemDetailsSchema.safeParse(conflictError);
      expect(res.success).toBe(true);
    });
  });

  describe('Audit Log Response Schema', () => {
    it('validates audit log entries for retainer generations', () => {
      const auditPayload = {
        data: [
          {
            id: 'd9b9328a-7954-4bb2-b362-e6e22f28b495',
            action: 'retainer-template.generated',
            tableName: 'retainer_template_generations',
            recordId: 'rec-123',
            entity: 'ATA',
            userId: 'user-456',
            details: {
              templateId: 'tpl-789',
              periodLabel: 'FY-2026-SMOKE',
              workRequestId: 'wr-101',
            },
            createdAt: '2026-10-04T08:00:00Z',
          },
        ],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      };

      const res = auditLogResponseSchema.safeParse(auditPayload);
      expect(res.success).toBe(true);
    });
  });

  describe('Effective Permissions Matrix Engine', () => {
    it('grants all 52 permission keys to Admin role', () => {
      const user: AdminUser = {
        id: 'u-admin',
        name: 'System Admin',
        email: 'admin@ata-lta.ph',
        role: 'Admin',
        departments: ['Management', 'Operations', 'Accounting', 'Documentation', 'HR'],
        entities: ['ATA', 'LTA'],
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const computed = computeUserEffectivePermissions(user);
      expect(computed.isAdminSuperUser).toBe(true);
      expect(computed.effectivePermissions.length).toBe(PERMISSION_KEYS.length);
      expect(computed.effectivePermissions.length).toBe(52);

      for (const key of ADMIN_EXCLUSIVE_PERMISSIONS) {
        expect(computed.effectivePermissions).toContain(key);
      }
    });

    it('grants Management permissions to Manager but strictly omits Admin-exclusive keys', () => {
      const user: AdminUser = {
        id: 'u-mgr',
        name: 'Doc Manager',
        email: 'dev-docs@ata-lta.ph',
        role: 'Manager',
        departments: ['Management', 'Documentation'],
        entities: ['ATA', 'LTA'],
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const computed = computeUserEffectivePermissions(user);
      expect(computed.isAdminSuperUser).toBe(false);

      // Manager has users:view and retainers:use
      expect(computed.effectivePermissions).toContain('users:view');
      expect(computed.effectivePermissions).toContain('retainers:use');

      // Manager MUST NOT have users:manage or retainers:edit
      expect(computed.effectivePermissions).not.toContain('users:manage');
      expect(computed.effectivePermissions).not.toContain('retainers:edit');
      expect(computed.effectivePermissions).not.toContain('workflow:phase_transition');
      expect(computed.effectivePermissions).not.toContain('workflow:qa_review');
    });

    it('correctly unions permissions across multiple departments', () => {
      const opsAndDocsUser: AdminUser = {
        id: 'u-multi',
        name: 'Cross Staff',
        email: 'staff@ata-lta.ph',
        role: 'Operations',
        departments: ['Operations', 'Documentation'],
        entities: ['ATA'],
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const computed = computeUserEffectivePermissions(opsAndDocsUser);
      // Both operations and documentation permissions should be present
      expect(computed.effectivePermissions).toContain('workflow:task_upload'); // From Operations
      expect(computed.effectivePermissions).toContain('dms:handover'); // From Documentation
      expect(computed.effectivePermissions).toContain('transmittal:mark'); // From Documentation
      // Admin keys must never leak
      expect(computed.effectivePermissions).not.toContain('users:manage');
      expect(computed.effectivePermissions).not.toContain('retainers:edit');
    });

    it('evaluates wildcard permissions correctly', () => {
      const granted = new Set(['approve_change:*', 'bypass_review:*']);
      expect(testPermission(granted, 'approve_change:tasks')).toBe(true);
      expect(testPermission(granted, 'approve_change:invoices')).toBe(true);
      expect(testPermission(granted, 'bypass_review:tasks')).toBe(true);
      expect(testPermission(granted, 'users:manage')).toBe(false);
    });

    it('categorizes keys into meaningful module groups', () => {
      expect(getPermissionModule('workflow:view')).toBe('Workflow & Operations');
      expect(getPermissionModule('billing:edit')).toBe('Billing & Invoices');
      expect(getPermissionModule('retainers:edit')).toBe('Retainer Templates');
      expect(getPermissionModule('users:manage')).toBe('User Management');
    });
  });
});
