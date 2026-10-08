/**
 * Migration 000060: Enable Supabase Realtime Publication
 *
 * Adds core collaborative tables to the `supabase_realtime` publication for
 * real-time change data capture (CDC) over WebSockets:
 * - work_requests
 * - tasks
 * - disbursements
 * - invoices
 *
 * Both up and down migrations are idempotent:
 * - Protected by DO $$ BEGIN ... END $$;
 * - Checks pg_publication for existence of 'supabase_realtime'
 * - Drops tables from publication on rollback
 *
 * @type {import('node-pg-migrate').Migration}
 */

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'work_requests') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE work_requests;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'disbursements') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE disbursements;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'invoices') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
        END IF;
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'work_requests') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE work_requests;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE tasks;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'disbursements') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE disbursements;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'invoices') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE invoices;
        END IF;
      END IF;
    END
    $$;
  `);
};
