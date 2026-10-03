/**
 * Time Entries module validation schemas.
 */

const { z } = require('zod');

const getMaxAllowedDate = () => {
  const utc = new Date().toISOString().slice(0, 10);
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return utc > local ? utc : local;
};

const createTimeEntrySchema = z.object({
  task_id: z.string().uuid('task_id must be a valid UUID'),
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'entry_date must be in YYYY-MM-DD format')
    .refine((val) => val <= getMaxAllowedDate(), {
      message: 'entry_date cannot be in the future',
    }),
  duration_minutes: z
    .number()
    .int('duration_minutes must be an integer')
    .min(1, 'duration_minutes must be at least 1')
    .max(1440, 'duration_minutes cannot exceed 1440'),
  note: z.string().max(5000).optional().nullable(),
  user_id: z.string().optional(), // Ignored in service/controller, caller forced
});

const updateTimeEntrySchema = z.object({
  task_id: z.string().uuid('task_id must be a valid UUID').optional(),
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'entry_date must be in YYYY-MM-DD format')
    .refine((val) => val <= getMaxAllowedDate(), {
      message: 'entry_date cannot be in the future',
    })
    .optional(),
  duration_minutes: z
    .number()
    .int('duration_minutes must be an integer')
    .min(1, 'duration_minutes must be at least 1')
    .max(1440, 'duration_minutes cannot exceed 1440')
    .optional(),
  note: z.string().max(5000).optional().nullable(),
});

const listQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be in YYYY-MM-DD format')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be in YYYY-MM-DD format')
    .optional(),
  task_id: z.string().uuid('task_id must be a valid UUID').optional(),
  user_id: z.string().uuid('user_id must be a valid UUID').optional(),
});

const summaryQuerySchema = z.object({
  date: z
    .string({ required_error: 'date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  user_id: z.string().uuid('user_id must be a valid UUID').optional(),
});

const entryParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

module.exports = {
  createTimeEntrySchema,
  updateTimeEntrySchema,
  listQuerySchema,
  summaryQuerySchema,
  entryParamsSchema,
  getMaxAllowedDate,
};
