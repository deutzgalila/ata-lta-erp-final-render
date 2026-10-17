/**
 * Zod Validation Schemas for Admin & Retainer Templates (Module #6)
 *
 * Citations:
 * - backend/src/modules/admin/schema.js
 * - backend/src/modules/operations/schema.js
 * - docs/api-contracts/modules/retainer-templates.md
 */

import { z } from 'zod';

// ============================================================================
// 1. Primitive Enums & Helpers
// ============================================================================

export const userRoleEnum = z.enum([
  'Admin',
  'Manager',
  'Accounting',
  'Operations',
  'Documentation',
  'HR',
]);

export const departmentEnum = z.enum([
  'Management',
  'Accounting',
  'Operations',
  'Documentation',
  'HR',
]);

export const entityCodeEnum = z.enum(['ATA', 'LTA']);

export const recurrenceTypeEnum = z.enum(['none', 'annual']);

export const creatablePhaseEnum = z.enum(['pre_processing', 'processing']);

export const priorityEnum = z.enum(['Low', 'Normal', 'High', 'Urgent']);

export const nullableUuid = z.preprocess(
  (val) => (val === '' || val === undefined ? null : val),
  z.string().uuid().nullable().optional()
);

/**
 * Password complexity rule (Spec 2.8 / R-14 / backend schema.js):
 * - 8–128 characters
 * - Uppercase letter (A–Z)
 * - Lowercase letter (a–z)
 * - Numeric digit (0–9)
 * - Special character (!@#$%^&*...)
 */
export const userPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-z]/, 'Must include lowercase letter')
  .regex(/[A-Z]/, 'Must include uppercase letter')
  .regex(/[0-9]/, 'Must include number')
  .regex(/[^a-zA-Z0-9]/, 'Must include special character');

// ============================================================================
// 2. User Management Schemas
// ============================================================================

export const createUserSchema = z.object({
  email: z.string().email('Valid email address required'),
  name: z.string().trim().min(1, 'Name is required').max(255),
  role: userRoleEnum,
  departments: z.array(departmentEnum).optional().default([]),
  entities: z.array(entityCodeEnum).min(1, 'At least one entity required (ATA or LTA)'),
  isActive: z.boolean().default(true),
  password: userPasswordSchema.optional(),
});

export const updateUserSchema = createUserSchema.partial();

export const adminUserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleEnum,
  departments: z.array(departmentEnum),
  entities: z.array(entityCodeEnum),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminUsersListResponseSchema = z.object({
  data: z.array(adminUserResponseSchema),
});

// ============================================================================
// 3. Retainer Template Task & Template Schemas
// ============================================================================

export const retainerTemplateTaskSchema = z.object({
  id: z.string().optional().nullable(),
  local_id: z.string().optional().nullable(),
  localId: z.string().optional().nullable(),
  title: z.string().trim().min(1, 'Task title is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  phase: creatablePhaseEnum.default('pre_processing'),
  default_assignees: z.array(z.string()).optional().nullable(),
  defaultAssignees: z.array(z.string()).optional().nullable(),
  depends_on_local_id: z.string().optional().nullable(),
  dependsOnLocalId: z.string().optional().nullable(),
  requiredLinkType: z.string().max(50).optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export const createRetainerTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  clientId: nullableUuid,
  client_id: nullableUuid,
  schedule: z.string().max(50).optional().nullable(),
  priority: priorityEnum.optional().default('Normal'),
  pfAmount: z.number().nonnegative().optional().default(0),
  pf_amount: z.number().nonnegative().optional().default(0),
  recurrence: recurrenceTypeEnum.default('none'),
  tasks: z.array(retainerTemplateTaskSchema).optional().default([]),
});

export const updateRetainerTemplateSchema = createRetainerTemplateSchema.partial();

export const retainerTemplateResponseSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  client_id: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  schedule: z.string().nullable().optional(),
  priority: priorityEnum,
  pf_amount: z.number().nonnegative(),
  recurrence: recurrenceTypeEnum,
  tasks: z.array(retainerTemplateTaskSchema),
  created_by: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  entities: z.object({ code: entityCodeEnum }).optional(),
  clients: z.object({ name: z.string() }).optional(),
});

export const retainerTemplatesListResponseSchema = z.object({
  data: z.array(retainerTemplateResponseSchema),
});

// ============================================================================
// 4. Retainer Generation Schemas
// ============================================================================

export const generateRetainerTemplateSchema = z.object({
  period_label: z.string().trim().min(1).max(50).optional().nullable(),
  periodLabel: z.string().trim().min(1).max(50).optional().nullable(),
  overrides: z
    .object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional().nullable(),
      clientId: nullableUuid,
      client_id: nullableUuid,
      priority: priorityEnum.optional(),
      assignedTo: nullableUuid,
      assigned_to: nullableUuid,
      coAssignees: z.array(z.string()).optional(),
      co_assignees: z.array(z.string()).optional(),
      dueDate: z.string().optional().nullable(),
      due_date: z.string().optional().nullable(),
    })
    .optional(),
});

// ============================================================================
// 5. Audit Log Schemas
// ============================================================================

export const listAuditQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  table: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  tableName: z.string(),
  recordId: z.string(),
  entity: z.string(),
  userId: z.string(),
  details: z.record(z.unknown()),
  createdAt: z.string(),
});

export const auditLogResponseSchema = z.object({
  data: z.array(auditLogEntrySchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
});

// ============================================================================
// 6. RFC 7807 Problem Details Schema
// ============================================================================

export const problemDetailsSchema = z.object({
  status: z.number().int(),
  title: z.string(),
  detail: z.string(),
  code: z.string().optional(),
});
