/**
 * Time Entries service.
 * Handles database operations, assignee verification, scoped queries, and summary aggregation.
 */

const { randomUUID } = require('crypto');
const { supabaseAdmin } = require('../../services/supabaseClient');
const AppError = require('../../lib/AppError');
const { buildPermissionSet, hasPermission } = require('../../lib/permissions');
const { getMaxAllowedDate } = require('./schema');

/**
 * Helper to compute effective permissions for a user.
 * @param {object} user
 * @param {Set<string>} [providedPermissions]
 * @returns {Set<string>}
 */
const getEffectivePermissions = (user, providedPermissions) => {
  if (providedPermissions instanceof Set) {
    return providedPermissions;
  }
  return buildPermissionSet({
    role: user.role || '',
    departments: user.departments || [],
  });
};

/**
 * Verify whether a user is an assigned worker on a task.
 * Checks `task_assignees` join table first, with fallback to legacy `tasks.assignee_id`.
 *
 * @param {string} taskId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const isUserAssignedToTask = async (taskId, userId) => {
  // 1. Check task_assignees join table (multi-assignee attribution standard)
  const { data: assignment, error: assignError } = await supabaseAdmin
    .from('task_assignees')
    .select('id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (assignError) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: assignError.message,
    });
  }

  if (assignment) {
    return true;
  }

  // 2. Fallback: check tasks table for task existence and legacy assignee_id
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id, assignee_id')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: taskError.message,
    });
  }

  if (!task) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: 'Task not found',
      code: 'TASK_NOT_FOUND',
    });
  }

  return task.assignee_id === userId;
};

/**
 * Create a new time entry.
 *
 * @param {object} params
 * @param {string} params.userId Authenticated user ID (creator)
 * @param {string} params.taskId Target task UUID
 * @param {string} params.entryDate Entry date (YYYY-MM-DD, cannot be in future)
 * @param {number} params.durationMinutes Duration in minutes (1..1440)
 * @param {string} [params.note] Optional note
 * @returns {Promise<object>} Created time entry
 */
const createTimeEntry = async ({
  userId,
  taskId,
  entryDate,
  durationMinutes,
  note,
}) => {
  // Validate assignee scope (Rule R2)
  const isAssigned = await isUserAssignedToTask(taskId, userId);
  if (!isAssigned) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'You are not assigned to this task',
      code: 'FORBIDDEN',
    });
  }

  // Defensive validation on date and duration (Rule R3)
  if (entryDate > getMaxAllowedDate()) {
    throw new AppError({
      statusCode: 400,
      title: 'Validation Error',
      detail: 'entry_date cannot be in the future',
      code: 'INVALID_ENTRY_DATE',
    });
  }

  if (
    typeof durationMinutes !== 'number' ||
    durationMinutes < 1 ||
    durationMinutes > 1440 ||
    !Number.isInteger(durationMinutes)
  ) {
    throw new AppError({
      statusCode: 400,
      title: 'Validation Error',
      detail: 'duration_minutes must be an integer between 1 and 1440',
      code: 'INVALID_DURATION',
    });
  }

  const now = new Date().toISOString();
  const insertPayload = {
    id: randomUUID(),
    user_id: userId,
    task_id: taskId,
    entry_date: entryDate,
    duration_minutes: durationMinutes,
    note: note || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  return data;
};

/**
 * List time entries with optional filters and user scoping.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user object
 * @param {Set<string>} [params.userPermissions]
 * @param {object} params.filters
 * @param {string} [params.filters.from] Start date (YYYY-MM-DD)
 * @param {string} [params.filters.to] End date (YYYY-MM-DD)
 * @param {string} [params.filters.task_id] Filter by task UUID
 * @param {string} [params.filters.user_id] Filter by user UUID (Admin only)
 * @returns {Promise<object[]>} List of time entries
 */
const listTimeEntries = async ({ user, userPermissions, filters = {} }) => {
  const perms = getEffectivePermissions(user, userPermissions);
  const hasEditAll = hasPermission(perms, 'timelog:edit_all');

  let query = supabaseAdmin.from('time_entries').select('*');

  // Scoping logic:
  // Non-admins only ever see their own entries.
  // Admins can filter by specific user_id if provided, or see all if omitted.
  if (hasEditAll) {
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
  } else {
    query = query.eq('user_id', user.id);
  }

  if (filters.task_id) {
    query = query.eq('task_id', filters.task_id);
  }

  if (filters.from) {
    query = query.gte('entry_date', filters.from);
  }

  if (filters.to) {
    query = query.lte('entry_date', filters.to);
  }

  query = query.order('entry_date', { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  return data || [];
};

/**
 * Get a single time entry by ID.
 *
 * @param {string} id
 * @returns {Promise<object>}
 */
const getTimeEntryById = async (id) => {
  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  if (!data) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: 'Time entry not found',
      code: 'NOT_FOUND',
    });
  }

  return data;
};

/**
 * Update an existing time entry.
 * Creator only, with Admin override (timelog:edit_all).
 *
 * @param {object} params
 * @param {string} params.id Time entry UUID
 * @param {object} params.user Authenticated user
 * @param {Set<string>} [params.userPermissions]
 * @param {object} params.updates Update payload
 * @returns {Promise<object>} Updated entry
 */
const updateTimeEntry = async ({ id, user, userPermissions, updates }) => {
  const existing = await getTimeEntryById(id);

  const perms = getEffectivePermissions(user, userPermissions);
  const hasEditAll = hasPermission(perms, 'timelog:edit_all');
  const isCreator = existing.user_id === user.id;

  if (!isCreator && !hasEditAll) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'You do not have permission to modify this time entry',
      code: 'FORBIDDEN',
    });
  }

  // If task_id is being updated, verify caller is assigned to new task
  if (updates.task_id && updates.task_id !== existing.task_id) {
    const isAssigned = await isUserAssignedToTask(updates.task_id, existing.user_id);
    if (!isAssigned) {
      throw new AppError({
        statusCode: 403,
        title: 'Forbidden',
        detail: 'You are not assigned to this task',
        code: 'FORBIDDEN',
      });
    }
  }

  // If entry_date is being updated, verify not in future
  if (updates.entry_date && updates.entry_date > getMaxAllowedDate()) {
    throw new AppError({
      statusCode: 400,
      title: 'Validation Error',
      detail: 'entry_date cannot be in the future',
      code: 'INVALID_ENTRY_DATE',
    });
  }

  // If duration_minutes is being updated, verify range
  if (updates.duration_minutes !== undefined) {
    if (
      typeof updates.duration_minutes !== 'number' ||
      updates.duration_minutes < 1 ||
      updates.duration_minutes > 1440 ||
      !Number.isInteger(updates.duration_minutes)
    ) {
      throw new AppError({
        statusCode: 400,
        title: 'Validation Error',
        detail: 'duration_minutes must be an integer between 1 and 1440',
        code: 'INVALID_DURATION',
      });
    }
  }

  const updatePayload = {
    ...(updates.duration_minutes !== undefined && { duration_minutes: updates.duration_minutes }),
    ...(updates.note !== undefined && { note: updates.note }),
    ...(updates.entry_date !== undefined && { entry_date: updates.entry_date }),
    ...(updates.task_id !== undefined && { task_id: updates.task_id }),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  return data;
};

/**
 * Delete a time entry.
 * Creator only, with Admin override (timelog:edit_all).
 *
 * @param {object} params
 * @param {string} params.id Time entry UUID
 * @param {object} params.user Authenticated user
 * @param {Set<string>} [params.userPermissions]
 * @returns {Promise<{id: string, deleted: boolean}>}
 */
const deleteTimeEntry = async ({ id, user, userPermissions }) => {
  const existing = await getTimeEntryById(id);

  const perms = getEffectivePermissions(user, userPermissions);
  const hasEditAll = hasPermission(perms, 'timelog:edit_all');
  const isCreator = existing.user_id === user.id;

  if (!isCreator && !hasEditAll) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'You do not have permission to delete this time entry',
      code: 'FORBIDDEN',
    });
  }

  const { error } = await supabaseAdmin
    .from('time_entries')
    .delete()
    .eq('id', id);

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  return { id, deleted: true };
};

/**
 * Summary endpoint aggregation (Rule R5).
 * Single indexed query aggregating total minutes and grouping by task with WR linkage.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {Set<string>} [params.userPermissions]
 * @param {string} params.date Target date (YYYY-MM-DD)
 * @param {string} [params.targetUserId] Optional target user ID (Admin only)
 * @returns {Promise<{date: string, total_minutes: number, by_task: Array<{task_id: string, work_request_id: string|null, title: string, minutes: number}>}>}
 */
const getSummary = async ({ user, userPermissions, date, targetUserId }) => {
  const perms = getEffectivePermissions(user, userPermissions);
  const hasEditAll = hasPermission(perms, 'timelog:edit_all');
  const effectiveUserId = hasEditAll && targetUserId ? targetUserId : user.id;

  // Single query utilizing idx_time_entries_user_date (user_id, entry_date DESC)
  const { data: rawEntries, error } = await supabaseAdmin
    .from('time_entries')
    .select(`
      id,
      task_id,
      duration_minutes,
      entry_date,
      tasks (
        id,
        title,
        work_request_id
      )
    `)
    .eq('user_id', effectiveUserId)
    .eq('entry_date', date);

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  const entries = rawEntries || [];

  // Resilient resolution: in test mock environments where nested relations are not auto-expanded,
  // batch fetch tasks by ID in one lookup
  const missingTaskIds = entries
    .filter((e) => !e.tasks || !e.tasks.title)
    .map((e) => e.task_id);

  if (missingTaskIds.length > 0) {
    const uniqueIds = Array.from(new Set(missingTaskIds));
    const { data: taskRows } = await supabaseAdmin
      .from('tasks')
      .select('id, title, work_request_id')
      .in('id', uniqueIds);

    const taskMap = new Map((taskRows || []).map((t) => [t.id, t]));
    entries.forEach((e) => {
      if (!e.tasks || !e.tasks.title) {
        e.tasks = taskMap.get(e.task_id) || {};
      }
    });
  }

  let total_minutes = 0;
  const taskGroupMap = new Map();

  entries.forEach((entry) => {
    const mins = Number(entry.duration_minutes) || 0;
    total_minutes += mins;

    const taskId = entry.task_id;
    const taskInfo = entry.tasks || {};
    const existing = taskGroupMap.get(taskId);

    if (existing) {
      existing.minutes += mins;
    } else {
      taskGroupMap.set(taskId, {
        task_id: taskId,
        work_request_id: taskInfo.work_request_id || null,
        title: taskInfo.title || '',
        minutes: mins,
      });
    }
  });

  return {
    date,
    total_minutes,
    by_task: Array.from(taskGroupMap.values()),
  };
};

module.exports = {
  createTimeEntry,
  listTimeEntries,
  getTimeEntryById,
  updateTimeEntry,
  deleteTimeEntry,
  getSummary,
  isUserAssignedToTask,
};
