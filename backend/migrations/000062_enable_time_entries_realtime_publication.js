/**
 * Migration 000062: Enable Time Entries & Task Time Logs Realtime Publication
 *
 * Adds time logging tables to the `supabase_realtime` publication for
 * real-time change data capture (CDC) over WebSockets:
 * - time_entries
 * - task_time_logs
 *
 * Sets REPLICA IDENTITY FULL so logical replication includes complete previous rows on UPDATE/DELETE.
 *
 * @type {import('node-pg-migrate').Migration}
 */

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'time_entries') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_time_logs') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE task_time_logs;
        END IF;
      END IF;

      ALTER TABLE time_entries REPLICA IDENTITY FULL;
      ALTER TABLE task_time_logs REPLICA IDENTITY FULL;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'time_entries') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE time_entries;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_time_logs') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE task_time_logs;
        END IF;
      END IF;
    END
    $$;
  `);
};
