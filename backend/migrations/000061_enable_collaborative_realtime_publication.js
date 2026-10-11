/**
 * Migration 000061: Enable Complete Collaborative Realtime Publication
 *
 * Adds missing collaborative tables to the `supabase_realtime` publication for
 * real-time change data capture (CDC) over WebSockets:
 * - operations_requests
 * - notifications
 * - transmittals
 * - documents
 * - task_assignees
 *
 * Sets REPLICA IDENTITY FULL on all 9 collaborative tables so that PostgreSQL
 * logical replication includes the complete previous row (`payload.old`) during
 * UPDATE and DELETE operations:
 * - work_requests
 * - tasks
 * - operations_requests
 * - notifications
 * - disbursements
 * - invoices
 * - transmittals
 * - documents
 * - task_assignees
 *
 * Both up and down migrations are idempotent:
 * - Protected by DO $$ BEGIN ... END $$;
 * - Checks pg_publication for existence of 'supabase_realtime'
 * - Checks pg_publication_tables before adding or dropping tables
 * - Uses valid PostgreSQL syntax for table removal (avoids illegal 'DROP TABLE IF EXISTS' in ALTER PUBLICATION)
 *
 * @type {import('node-pg-migrate').Migration}
 */

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'operations_requests') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE operations_requests;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transmittals') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE transmittals;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'documents') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE documents;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_assignees') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE task_assignees;
        END IF;
      END IF;

      -- Set REPLICA IDENTITY FULL to ensure payload.old contains all columns on DELETE/UPDATE
      ALTER TABLE work_requests REPLICA IDENTITY FULL;
      ALTER TABLE tasks REPLICA IDENTITY FULL;
      ALTER TABLE operations_requests REPLICA IDENTITY FULL;
      ALTER TABLE notifications REPLICA IDENTITY FULL;
      ALTER TABLE disbursements REPLICA IDENTITY FULL;
      ALTER TABLE invoices REPLICA IDENTITY FULL;
      ALTER TABLE transmittals REPLICA IDENTITY FULL;
      ALTER TABLE documents REPLICA IDENTITY FULL;
      ALTER TABLE task_assignees REPLICA IDENTITY FULL;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'operations_requests') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE operations_requests;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transmittals') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE transmittals;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'documents') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE documents;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_assignees') THEN
          ALTER PUBLICATION supabase_realtime DROP TABLE task_assignees;
        END IF;
      END IF;
    END
    $$;
  `);
};
