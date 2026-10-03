/**
 * Test Suite: Phase Model Migrations (Migrations A, B, C)
 * Covers AC-1 (Rules R1, R2) and DDL schema constraints.
 */

const { Client } = require('pg');
const m52 = require('../migrations/000052_phase_model_columns');
const m53 = require('../migrations/000053_status_constraint_superset');
const m54 = require('../migrations/000054_phase_not_null');

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

describe('Phase Model Database Migrations', () => {
  let client;
  let testSchema;

  const runMigration = async (migrationFn) => {
    const queries = [];
    const pgm = {
      sql: (query) => {
        queries.push(query);
      },
    };
    await migrationFn(pgm);
    for (const q of queries) {
      await client.query(q);
    }
  };

  beforeAll(async () => {
    client = new Client({ connectionString });
    await client.connect();
    testSchema = `test_p0_c_migrations_${Date.now()}`;
    await client.query(`CREATE SCHEMA ${testSchema}`);
    await client.query(`SET search_path TO ${testSchema}, public`);

    // Baseline tables mimicking migration 000050 state
    await client.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        email text NOT NULL
      );

      CREATE TABLE work_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        status text NOT NULL DEFAULT 'Draft',
        client_id uuid,
        entity text,
        created_at timestamptz DEFAULT now(),
        assigned_to uuid REFERENCES users(id)
      );

      ALTER TABLE work_requests
        ADD CONSTRAINT chk_work_requests_status
        CHECK (status IN (
          'Draft', 'Pre-processing', 'In Progress', 'Processing',
          'For Review', 'Billing', 'Disbursement', 'On Hold',
          'Completed', 'Cancelled'
        ));

      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        work_request_id uuid NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'Draft',
        created_at timestamptz DEFAULT now()
      );
    `);
  });

  afterAll(async () => {
    if (client) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
      } finally {
        await client.end();
      }
    }
  });

  describe('Migration A: 000052_phase_model_columns', () => {
    it('applies up cleanly and adds expected columns to work_requests and tasks', async () => {
      await runMigration(m52.up);

      // Verify columns on work_requests
      const wrColsRes = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = '${testSchema}' AND table_name = 'work_requests'
      `);
      const wrCols = wrColsRes.rows.map((r) => r.column_name);
      expect(wrCols).toContain('phase');
      expect(wrCols).toContain('phase_entered_at');
      expect(wrCols).toContain('on_hold');

      // Verify columns on tasks
      const taskColsRes = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = '${testSchema}' AND table_name = 'tasks'
      `);
      const taskCols = taskColsRes.rows.map((r) => r.column_name);
      expect(taskCols).toContain('phase');
      expect(taskCols).toContain('qa_status');
      expect(taskCols).toContain('assigned_by');
      expect(taskCols).toContain('assigned_at');

      // Verify task_assignees join table
      const tablesRes = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${testSchema}' AND table_name = 'task_assignees'
      `);
      expect(tablesRes.rows.length).toBe(1);
    });

    it('enforces chk_work_requests_phase check constraint', async () => {
      // Valid phase insertion
      const validRes = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('Valid WR', 'Draft', 'pre_processing')
        RETURNING id, phase
      `);
      expect(validRes.rows[0].phase).toBe('pre_processing');

      // NULL phase is allowed (before Migration C)
      const nullPhaseRes = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('Null Phase WR', 'Draft', NULL)
        RETURNING id, phase
      `);
      expect(nullPhaseRes.rows[0].phase).toBeNull();

      // Invalid phase rejection
      await expect(
        client.query(`
          INSERT INTO work_requests (title, status, phase)
          VALUES ('Invalid Phase WR', 'Draft', 'not_a_valid_phase')
        `)
      ).rejects.toThrow(/chk_work_requests_phase/);
    });

    it('enforces chk_tasks_phase check constraint (pre_processing and processing only)', async () => {
      const wrRes = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('Parent WR', 'Draft', 'pre_processing')
        RETURNING id
      `);
      const wrId = wrRes.rows[0].id;

      // Valid task phases
      await client.query(`
        INSERT INTO tasks (work_request_id, title, phase)
        VALUES ('${wrId}', 'Pre Task', 'pre_processing')
      `);
      await client.query(`
        INSERT INTO tasks (work_request_id, title, phase)
        VALUES ('${wrId}', 'Proc Task', 'processing')
      `);

      // NULL phase allowed
      await client.query(`
        INSERT INTO tasks (work_request_id, title, phase)
        VALUES ('${wrId}', 'Null Task', NULL)
      `);

      // quality_assurance is invalid for tasks (clamping requirement)
      await expect(
        client.query(`
          INSERT INTO tasks (work_request_id, title, phase)
          VALUES ('${wrId}', 'QA Task', 'quality_assurance')
        `)
      ).rejects.toThrow(/chk_tasks_phase/);

      // completion is invalid for tasks
      await expect(
        client.query(`
          INSERT INTO tasks (work_request_id, title, phase)
          VALUES ('${wrId}', 'Completion Task', 'completion')
        `)
      ).rejects.toThrow(/chk_tasks_phase/);
    });

    it('enforces chk_tasks_qa_status check constraint', async () => {
      const wrRes = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('Parent WR 2', 'Draft', 'processing')
        RETURNING id
      `);
      const wrId = wrRes.rows[0].id;

      // Default qa_status is 'none'
      const defaultTask = await client.query(`
        INSERT INTO tasks (work_request_id, title)
        VALUES ('${wrId}', 'Task Default QA')
        RETURNING qa_status
      `);
      expect(defaultTask.rows[0].qa_status).toBe('none');

      // Valid qa_status values
      await client.query(`
        INSERT INTO tasks (work_request_id, title, qa_status)
        VALUES ('${wrId}', 'Passed Task', 'passed')
      `);
      await client.query(`
        INSERT INTO tasks (work_request_id, title, qa_status)
        VALUES ('${wrId}', 'Failed Task', 'failed')
      `);

      // Invalid qa_status rejection
      await expect(
        client.query(`
          INSERT INTO tasks (work_request_id, title, qa_status)
          VALUES ('${wrId}', 'Invalid QA Task', 'approved')
        `)
      ).rejects.toThrow(/chk_tasks_qa_status/);
    });

    it('manages task_assignees join table integrity and uniqueness', async () => {
      const userRes = await client.query(`
        INSERT INTO users (name, email)
        VALUES ('Worker 1', 'worker1@example.com')
        RETURNING id
      `);
      const userId = userRes.rows[0].id;

      const wrRes = await client.query(`
        INSERT INTO work_requests (title) VALUES ('WR Assignee Test') RETURNING id
      `);
      const taskRes = await client.query(`
        INSERT INTO tasks (work_request_id, title) VALUES ('${wrRes.rows[0].id}', 'Task Assignee Test') RETURNING id
      `);
      const taskId = taskRes.rows[0].id;

      // Insert assignee
      await client.query(`
        INSERT INTO task_assignees (task_id, user_id)
        VALUES ('${taskId}', '${userId}')
      `);

      // Unique constraint prevents duplicate (task_id, user_id)
      await expect(
        client.query(`
          INSERT INTO task_assignees (task_id, user_id)
          VALUES ('${taskId}', '${userId}')
        `)
      ).rejects.toThrow(/uq_task_assignees_task_user/);
    });

    it('is idempotent on multiple UP executions', async () => {
      await expect(runMigration(m52.up)).resolves.not.toThrow();
    });
  });

  describe('Migration B: 000053_status_constraint_superset', () => {
    it('broadens work_requests status constraint to superset containing Quality Assurance', async () => {
      await runMigration(m53.up);

      // Verify Quality Assurance is accepted
      const qaWr = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('QA Status WR', 'Quality Assurance', 'quality_assurance')
        RETURNING status
      `);
      expect(qaWr.rows[0].status).toBe('Quality Assurance');

      // Verify all legacy statuses are still accepted
      const legacyStatuses = [
        'Draft',
        'Pre-processing',
        'In Progress',
        'Processing',
        'For Review',
        'Billing',
        'Disbursement',
        'On Hold',
        'Completed',
        'Cancelled',
      ];

      for (const st of legacyStatuses) {
        const res = await client.query(`
          INSERT INTO work_requests (title, status)
          VALUES ('Legacy WR ${st}', '${st}')
          RETURNING status
        `);
        expect(res.rows[0].status).toBe(st);
      }

      // Verify random invalid status is still rejected
      await expect(
        client.query(`
          INSERT INTO work_requests (title, status)
          VALUES ('Invalid Status WR', 'Archived_Legacy')
        `)
      ).rejects.toThrow(/chk_work_requests_status/);
    });

    it('reverts superset constraint on down migration', async () => {
      // First delete Quality Assurance row so down migration check passes
      await client.query(`DELETE FROM work_requests WHERE status = 'Quality Assurance'`);

      await runMigration(m53.down);

      // Now Quality Assurance is rejected under the restored 10-status constraint
      await expect(
        client.query(`
          INSERT INTO work_requests (title, status)
          VALUES ('QA Status Rejected', 'Quality Assurance')
        `)
      ).rejects.toThrow(/chk_work_requests_status/);

      // Re-apply up to restore superset
      await runMigration(m53.up);
    });
  });

  describe('Migration A Rollback Integrity', () => {
    it('rolls back Migration A cleanly', async () => {
      await runMigration(m52.down);

      // task_assignees table is dropped
      const tablesRes = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${testSchema}' AND table_name = 'task_assignees'
      `);
      expect(tablesRes.rows.length).toBe(0);

      // Added columns dropped from work_requests
      const wrColsRes = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = '${testSchema}' AND table_name = 'work_requests'
      `);
      const wrCols = wrColsRes.rows.map((r) => r.column_name);
      expect(wrCols).not.toContain('phase');
      expect(wrCols).not.toContain('phase_entered_at');
      expect(wrCols).not.toContain('on_hold');

      // Re-apply up so subsequent tests have full schema
      await runMigration(m52.up);
    });
  });

  describe('Migration C: 000054_phase_not_null (Cutover Window Only)', () => {
    it('enforces phase NOT NULL on active work requests while exempting Cancelled rows', async () => {
      // In P3 cutover, backfill runs before Migration C. Clean up any prior unbackfilled test rows.
      await client.query("DELETE FROM tasks WHERE phase IS NULL AND status != 'Cancelled'");
      await client.query("DELETE FROM work_requests WHERE phase IS NULL AND status != 'Cancelled'");

      await runMigration(m54.up);

      // Cancelled WR with NULL phase is ALLOWED
      const cancelledRes = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('Cancelled WR', 'Cancelled', NULL)
        RETURNING id, status, phase
      `);
      expect(cancelledRes.rows[0].status).toBe('Cancelled');
      expect(cancelledRes.rows[0].phase).toBeNull();

      // Active WR with phase is ALLOWED
      const activeRes = await client.query(`
        INSERT INTO work_requests (title, status, phase)
        VALUES ('Active WR', 'Draft', 'pre_processing')
        RETURNING id, status, phase
      `);
      expect(activeRes.rows[0].phase).toBe('pre_processing');

      // Active WR with NULL phase is REJECTED
      await expect(
        client.query(`
          INSERT INTO work_requests (title, status, phase)
          VALUES ('Active WR Missing Phase', 'Draft', NULL)
        `)
      ).rejects.toThrow(/chk_work_requests_phase_not_null/);

      // Clean rollback of Migration C
      await runMigration(m54.down);

      // After rollback, active WR with NULL phase is permitted again
      await expect(
        client.query(`
          INSERT INTO work_requests (title, status, phase)
          VALUES ('Active WR Null Phase Permitted', 'Draft', NULL)
        `)
      ).resolves.not.toThrow();
    });
  });
});
