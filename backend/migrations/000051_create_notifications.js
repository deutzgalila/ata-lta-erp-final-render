/**
 * Migration 000051: Create notifications table with indexes.
 *
 * Supports in-app notifications for pending requests and work request transitions/QA.
 */

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS notifications (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type         text NOT NULL CHECK (type IN (
                     'pending_request.resolved',
                     'wr.transition_request.received',
                     'wr.transition_request.resolved',
                     'wr.qa_reroute'
                   )),
      payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
      read_at      timestamptz,
      created_at   timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_notifications_user_created;
    DROP INDEX IF EXISTS idx_notifications_user_unread;
    DROP TABLE IF EXISTS notifications;
  `);
};
