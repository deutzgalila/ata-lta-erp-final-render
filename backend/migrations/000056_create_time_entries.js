/**
 * Migration 000056: Create time_entries table with indexes.
 *
 * Supports duration-canonical staff time logging against assigned tasks.
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id          uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      entry_date       date NOT NULL,
      duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
      note             text,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_time_entries_task;
    DROP INDEX IF EXISTS idx_time_entries_user_date;
    DROP TABLE IF EXISTS time_entries;
  `);
};
