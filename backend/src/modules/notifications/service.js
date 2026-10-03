/**
 * Notifications service.
 * Handles database queries, user scoping, pagination, and idempotent read-marking.
 */

const { supabaseAdmin } = require('../../services/supabaseClient');
const AppError = require('../../lib/AppError');
const logger = require('../../lib/logger');

/**
 * List own notifications with cursor pagination, newest first.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} [params.limit=50]
 * @param {string} [params.cursor]
 * @returns {Promise<{data: object[], meta: {limit: number, next_cursor: string|null}}>}
 */
const listNotifications = async ({ userId, limit = 50, cursor }) => {
  let query = supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', userId);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  query = query.order('created_at', { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  const items = data || [];
  const next_cursor = items.length === limit ? items[items.length - 1].created_at : null;

  return {
    data: items,
    meta: {
      limit,
      next_cursor,
    },
  };
};

/**
 * Mark a single notification as read (idempotent).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.id
 * @returns {Promise<object>}
 */
const markAsRead = async ({ userId, id }) => {
  const { data: existing, error: findError } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (findError) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: findError.message,
    });
  }

  if (!existing) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: 'Notification not found',
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }

  // R1: Users can only read/mark their own rows
  if (existing.user_id !== userId) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'You do not have permission to access this notification',
      code: 'FORBIDDEN',
    });
  }

  // R4: Idempotent read-marking — if already read, return without mutation
  if (existing.read_at) {
    return existing;
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: now })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updateError) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: updateError.message,
    });
  }

  return updated || { ...existing, read_at: now };
};

/**
 * Mark all unread notifications of the user as read.
 *
 * @param {object} params
 * @param {string} params.userId
 * @returns {Promise<{marked: number}>}
 */
const markAllAsRead = async ({ userId }) => {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: now })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: error.message,
    });
  }

  return {
    marked: data ? data.length : 0,
  };
};

/**
 * Get count of unread notifications for a user.
 * Cheap COUNT over the partial index idx_notifications_user_unread.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
const getUnreadCount = async (userId) => {
  if (!userId) return 0;
  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      logger.warn('[NOTIFICATIONS] Failed to count unread notifications', {
        error: error.message,
        userId,
      });
      return 0;
    }

    return count || 0;
  } catch (err) {
    logger.warn('[NOTIFICATIONS] Error counting unread notifications', {
      error: err.message,
      userId,
    });
    return 0;
  }
};

module.exports = {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
