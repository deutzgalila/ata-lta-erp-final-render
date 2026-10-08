/**
 * Operations / Work Requests Zod schemas.
 * Phase 4 implementation by Agent A.
 */

const { z } = require('zod');

const timeLogSchema = z.object({
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  date: z.string(),
  hours: z.number().nonnegative(),
  userId: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
  workerName: z.string().optional().nullable(),
  checklistItemId: z.string().uuid().optional().nullable(),
});

const checklistItemSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  text: z.string().min(1),
  category: z.string().optional().nullable(),
  completed: z.boolean().default(false),
  assigneeId: z.string().uuid().optional().nullable(),
  assigneeName: z.string().optional().nullable(),
  dependsOn: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .nullable(),
  periodYear: z
    .string()
    .regex(/^[a-zA-Z0-9\s/-]*$/)
    .max(100)
    .optional()
    .nullable(),
  timeLogs: z.array(timeLogSchema).optional(),
});

const phaseTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignees: z.array(z.string()).optional().default([]),
  depends_on: z.any().optional().nullable(),
  dependsOn: z.any().optional().nullable(),
  local_id: z.string().optional().nullable(),
  localId: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const phasesSchema = z
  .object({
    pre_processing: z
      .object({
        tasks: z.array(phaseTaskSchema).optional().default([]),
      })
      .optional(),
    processing: z
      .object({
        tasks: z.array(phaseTaskSchema).optional().default([]),
      })
      .optional(),
  })
  .passthrough();

const createWorkRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  entity: z.enum(['ATA', 'LTA', 'ALL']).optional(),
  status: z.string().max(50).optional(),
  phase: z.string().max(50).optional(),
  requestedBy: z.string().uuid().optional(),
  assignedTo: z.preprocess(
    (val) => (val === '' || val === undefined ? null : val),
    z.string().uuid().nullable().optional()
  ),
  coAssignees: z.array(z.string()).optional().default([]),
  dueDate: z.string().optional().nullable(),
  priority: z.string().max(50).optional(),
  idempotency_key: z.string().optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
  phases: phasesSchema.optional().nullable(),
});

const WR_STATUSES = [
  'Draft',
  'Pre-processing',
  'In Progress',
  'Processing',
  'For Review',
  'Quality Assurance',
  'Billing',
  'Disbursement',
  'On Hold',
  'Completed',
  'Cancelled',
  'Received',
  'For Client Approval',
  'For Requirements',
  'Pending Requirements',
  'For Assignment',
  'For Supervisor Review',
  'For Payment',
  'For Submission',
  'For Quality Check',
];

const updateWorkRequestSchema = createWorkRequestSchema.partial().extend({
  archived: z.boolean().optional(),
  status: z.enum(WR_STATUSES).optional(),
  // OCC guard (Spec 2.2 / R-10): update applies only if the stored version matches.
  expectedVersion: z.number().int().positive().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  status: z.string().max(50).optional(),
  phase: z.enum(['pre_processing', 'processing']).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  assigneeName: z.string().optional().nullable(),
  assignees: z.array(z.string().uuid()).optional().nullable(),
  predecessors: z.array(z.string().uuid()).optional(),
  dueDate: z.string().optional().nullable(),
  checklist: z.array(checklistItemSchema).optional(),
  timeLogs: z.array(timeLogSchema).optional(),
  coAssignees: z.array(z.string().uuid()).optional().nullable(),
  taskDocuments: z.array(z.any()).optional().nullable(),
  requiredLinkType: z.string().max(50).optional().nullable(),
});

const updateTaskSchema = createTaskSchema
  .partial()
  .extend({
    phase: z.any().optional(),
    // OCC guard (Spec 2.2 / R-10): update applies only if the stored version matches.
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.phase !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Task phase is immutable once created',
        path: ['phase'],
        params: { code: 'TASK_PHASE_IMMUTABLE' },
      });
    }
  });

const nullableUuid = z.preprocess(
  (val) => (val === '' || val === undefined ? null : val),
  z.string().uuid().nullable().optional()
);

const taskTemplateSchema = z.object({
  id: z.string().optional().nullable(),
  local_id: z.string().optional().nullable(),
  localId: z.string().optional().nullable(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  phase: z.enum(['pre_processing', 'processing']).optional().nullable(),
  assigneeId: nullableUuid,
  assigneeName: z.string().optional().nullable(),
  coAssignees: z.array(z.string()).optional().nullable(),
  default_assignees: z.array(z.string()).optional().nullable(),
  defaultAssignees: z.array(z.string()).optional().nullable(),
  predecessors: z.array(z.string()).optional().nullable(),
  depends_on_local_id: z.string().optional().nullable(),
  dependsOnLocalId: z.string().optional().nullable(),
  requiredLinkType: z.string().max(50).optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const retainerTemplateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  clientId: nullableUuid,
  client_id: nullableUuid,
  schedule: z.string().max(50).optional().nullable(),
  priority: z.string().max(50).optional().nullable(),
  pfAmount: z.number().nonnegative().optional().nullable(),
  pf_amount: z.number().nonnegative().optional().nullable(),
  recurrence: z.enum(['none', 'annual']).default('none').optional(),
  tasks: z.array(taskTemplateSchema).optional(),
});

const generateRetainerTemplateSchema = z.object({
  period_label: z.string().trim().min(1).max(50).optional().nullable(),
  periodLabel: z.string().trim().min(1).max(50).optional().nullable(),
  overrides: z
    .object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional().nullable(),
      clientId: nullableUuid,
      client_id: nullableUuid,
      priority: z.string().max(50).optional(),
      assignedTo: nullableUuid,
      assigned_to: nullableUuid,
      coAssignees: z.array(z.string()).optional(),
      co_assignees: z.array(z.string()).optional(),
      dueDate: z.string().optional().nullable(),
      due_date: z.string().optional().nullable(),
    })
    .optional(),
});

const groundWorkerSchema = z.object({
  name: z.string().min(1).max(255),
});

const addTimeLogsSchema = z.object({
  logs: z.array(timeLogSchema),
});

const standardTaskTemplateSchema = z.object({
  title: z.string().min(1).max(255),
  requiredLinkType: z.string().max(50).optional().nullable(),
  defaultChecklist: z
    .array(
      z.object({
        id: z.string().optional().nullable(),
        text: z.string().min(1),
        category: z.string().optional().nullable(),
        periodYear: z.string().optional().nullable(),
      })
    )
    .optional()
    .default([]),
  coAssignees: z.array(z.string()).optional().default([]),
  sortOrder: z.number().int().optional().nullable(),
});

const advanceWorkRequestSchema = z.object({
  to_phase: z.enum(['processing', 'quality_assurance', 'completion']).optional(),
  toPhase: z.enum(['processing', 'quality_assurance', 'completion']).optional(),
});

const qaReviewTaskResultSchema = z
  .object({
    task_id: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    qa_status: z.enum(['passed', 'failed']).optional(),
    qaStatus: z.enum(['passed', 'failed']).optional(),
  })
  .refine(
    (data) => Boolean((data.task_id || data.taskId) && (data.qa_status || data.qaStatus)),
    { message: 'Each result must include task_id and qa_status' }
  );

const qaReviewSchema = z.object({
  results: z.array(qaReviewTaskResultSchema).min(1, 'results array cannot be empty'),
});

const rerouteSchema = z
  .object({
    to_phase: z.enum(['pre_processing', 'processing']).optional(),
    toPhase: z.enum(['pre_processing', 'processing']).optional(),
    reason: z.string().trim().min(1, 'reason is required for reroute'),
  })
  .refine((data) => Boolean(data.to_phase || data.toPhase), {
    message: 'to_phase must be either pre_processing or processing',
  });

module.exports = {
  createWorkRequestSchema,
  updateWorkRequestSchema,
  createTaskSchema,
  updateTaskSchema,
  checklistItemSchema,
  timeLogSchema,
  retainerTemplateSchema,
  groundWorkerSchema,
  addTimeLogsSchema,
  standardTaskTemplateSchema,
  advanceWorkRequestSchema,
  qaReviewSchema,
  rerouteSchema,
  generateRetainerTemplateSchema,
};
