/**
 * Test Suite: Backfill Script (backend/scripts/backfill-phases.js)
 * Covers AC-2, AC-3, AC-4, AC-5 and mapping rules.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const m52 = require('../migrations/000052_phase_model_columns');
const m53 = require('../migrations/000053_status_constraint_superset');
const {
  STATUS_TO_PHASE_MAP,
  clampTaskPhase,
  mapStatusToPhase,
  recoverPriorStatus,
  parseArgs,
  runBackfill,
} = require('../scripts/backfill-phases');

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

describe('Backfill Script (backfill-phases.js)', () => {
  describe('Unit: Status Mapping Matrix (Decision D6)', () => {
    it('exports STATUS_TO_PHASE_MAP matching Decision D6 mapping', () => {
      expect(STATUS_TO_PHASE_MAP.Draft).toEqual({ phase: 'pre_processing', on_hold: false });
      expect(STATUS_TO_PHASE_MAP.Cancelled).toEqual({ phase: null, on_hold: false, skip: true });
      expect(STATUS_TO_PHASE_MAP['On Hold']).toBeUndefined();
    });

    it('maps Draft and Pre-processing to pre_processing (on_hold = false)', () => {
      expect(mapStatusToPhase('Draft')).toEqual({ phase: 'pre_processing', on_hold: false });
      expect(mapStatusToPhase('Pre-processing')).toEqual({
        phase: 'pre_processing',
        on_hold: false,
      });
    });

    it('maps In Progress and Processing to processing (on_hold = false)', () => {
      expect(mapStatusToPhase('In Progress')).toEqual({ phase: 'processing', on_hold: false });
      expect(mapStatusToPhase('Processing')).toEqual({ phase: 'processing', on_hold: false });
    });

    it('maps For Review and Quality Assurance to quality_assurance (on_hold = false)', () => {
      expect(mapStatusToPhase('For Review')).toEqual({
        phase: 'quality_assurance',
        on_hold: false,
      });
      expect(mapStatusToPhase('Quality Assurance')).toEqual({
        phase: 'quality_assurance',
        on_hold: false,
      });
    });

    it('maps Billing, Disbursement, and Completed to completion (on_hold = false)', () => {
      expect(mapStatusToPhase('Billing')).toEqual({ phase: 'completion', on_hold: false });
      expect(mapStatusToPhase('Disbursement')).toEqual({ phase: 'completion', on_hold: false });
      expect(mapStatusToPhase('Completed')).toEqual({ phase: 'completion', on_hold: false });
    });

    it('preserves Cancelled as terminal state (phase = null, skip = true)', () => {
      expect(mapStatusToPhase('Cancelled')).toEqual({ phase: null, on_hold: false, skip: true });
    });

    it('recovers On Hold status when valid priorStatus is supplied', () => {
      const recoveredFromProcessing = mapStatusToPhase('On Hold', 'Processing');
      expect(recoveredFromProcessing).toEqual({
        phase: 'processing',
        on_hold: true,
        recovered: true,
        priorStatus: 'Processing',
      });

      const recoveredFromReview = mapStatusToPhase('On Hold', 'For Review');
      expect(recoveredFromReview).toEqual({
        phase: 'quality_assurance',
        on_hold: true,
        recovered: true,
        priorStatus: 'For Review',
      });
    });

    it('defaults On Hold to pre_processing and marks ambiguous when no prior status exists', () => {
      const ambiguous = mapStatusToPhase('On Hold', null);
      expect(ambiguous).toEqual({
        phase: 'pre_processing',
        on_hold: true,
        ambiguous: true,
      });
    });
  });

  describe('Unit: Task Clamping & Inheritance', () => {
    it('clamps quality_assurance and completion parent WR phases to processing for child tasks', () => {
      expect(clampTaskPhase('quality_assurance')).toBe('processing');
      expect(clampTaskPhase('completion')).toBe('processing');
    });

    it('preserves pre_processing and processing for child tasks', () => {
      expect(clampTaskPhase('pre_processing')).toBe('pre_processing');
      expect(clampTaskPhase('processing')).toBe('processing');
    });

    it('returns null for Cancelled or null parent phases', () => {
      expect(clampTaskPhase(null)).toBeNull();
    });
  });

  describe('Unit: CLI Argument Parsing', () => {
    it('defaults to dry-run = true when neither flag is supplied', () => {
      const args = parseArgs([]);
      expect(args.dryRun).toBe(true);
      expect(args.apply).toBe(false);
    });

    it('sets apply = true and dry-run = false when --apply is supplied', () => {
      const args = parseArgs(['--apply', '--report', '/tmp/custom-report.json']);
      expect(args.apply).toBe(true);
      expect(args.dryRun).toBe(false);
      expect(args.report).toBe('/tmp/custom-report.json');
    });
  });

  describe('Database Execution & AC-2, AC-3, AC-4, AC-5 Gates', () => {
    let client;
    let testSchema;
    const reportDir = path.join(__dirname, 'temp_reports');

    beforeAll(async () => {
      fs.mkdirSync(reportDir, { recursive: true });

      client = new Client({ connectionString });
      await client.connect();
      testSchema = `test_p0_c_backfill_${Date.now()}`;
      await client.query(`CREATE SCHEMA ${testSchema}`);
      await client.query(`SET search_path TO ${testSchema}, public`);

      // Create test tables mimicking migrated baseline
      await client.query(`
        CREATE TABLE users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL
        );

        CREATE TABLE work_requests (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          title text NOT NULL,
          status text NOT NULL DEFAULT 'Draft',
          client_id uuid,
          entity text DEFAULT 'ATA',
          created_at timestamptz DEFAULT now(),
          assigned_to uuid REFERENCES users(id)
        );

        CREATE TABLE tasks (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          work_request_id uuid NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
          title text NOT NULL,
          status text NOT NULL DEFAULT 'Draft',
          created_at timestamptz DEFAULT now()
        );

        CREATE TABLE status_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          table_name text NOT NULL,
          record_id uuid NOT NULL,
          old_status text,
          new_status text,
          created_at timestamptz DEFAULT now()
        );

        CREATE TABLE audit_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          table_name text NOT NULL,
          record_id uuid NOT NULL,
          action text NOT NULL,
          details jsonb,
          created_at timestamptz DEFAULT now()
        );
      `);

      // Run Migration A and B
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
      await runMigration(m52.up);
      await runMigration(m53.up);
    });

    afterAll(async () => {
      if (fs.existsSync(reportDir)) {
        fs.rmSync(reportDir, { recursive: true, force: true });
      }
      if (client) {
        try {
          await client.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
        } finally {
          await client.end();
        }
      }
    });

    beforeEach(async () => {
      // Clear data before each test scenario
      await client.query('DELETE FROM tasks');
      await client.query('DELETE FROM work_requests');
      await client.query('DELETE FROM status_history');
      await client.query('DELETE FROM audit_logs');
    });

    it('AC-2: --dry-run prints per-bucket counts and SQL plan without mutating data', async () => {
      const dryReportPath = path.join(reportDir, 'dry-run-report.json');

      // Seed records across buckets
      const wr1 = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('WR 1', 'Draft') RETURNING id"
      );
      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${wr1.rows[0].id}', 'Task 1')`
      );

      const wr2 = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('WR 2', 'In Progress') RETURNING id"
      );
      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${wr2.rows[0].id}', 'Task 2')`
      );

      const report = await runBackfill({
        client,
        apply: false,
        env: 'local',
        reportPath: dryReportPath,
      });

      expect(report.mode).toBe('dry-run');
      expect(report.summary.total_work_requests_mutated).toBe(2);
      expect(report.summary.total_tasks_mutated).toBe(2);
      expect(report.buckets.pre_processing.wr_count).toBe(1);
      expect(report.buckets.processing.wr_count).toBe(1);
      expect(report.sql_plan_preview.length).toBeGreaterThan(0);

      // Verify ZERO database mutations were committed
      const unmutatedWrRes = await client.query(
        'SELECT count(*)::int AS count FROM work_requests WHERE phase IS NOT NULL'
      );
      expect(unmutatedWrRes.rows[0].count).toBe(0);

      const unmutatedTaskRes = await client.query(
        'SELECT count(*)::int AS count FROM tasks WHERE phase IS NOT NULL'
      );
      expect(unmutatedTaskRes.rows[0].count).toBe(0);

      // Verify report file was generated
      expect(fs.existsSync(dryReportPath)).toBe(true);
    });

    it('AC-2: --apply writes mutations and logs every mapped row to report file', async () => {
      const applyReportPath = path.join(reportDir, 'apply-report.json');

      const wrPre = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('WR Pre', 'Pre-processing') RETURNING id"
      );
      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${wrPre.rows[0].id}', 'Task Pre')`
      );

      const wrRev = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('WR Rev', 'For Review') RETURNING id"
      );
      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${wrRev.rows[0].id}', 'Task Rev')`
      );

      const wrComp = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('WR Comp', 'Completed') RETURNING id"
      );
      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${wrComp.rows[0].id}', 'Task Comp')`
      );

      const report = await runBackfill({
        client,
        apply: true,
        env: 'local',
        reportPath: applyReportPath,
      });

      expect(report.mode).toBe('apply');
      expect(report.summary.total_work_requests_mutated).toBe(3);
      expect(report.summary.total_tasks_mutated).toBe(3);

      // Verify work_requests were updated in DB
      const updatedPre = await client.query(
        `SELECT phase, on_hold FROM work_requests WHERE id = '${wrPre.rows[0].id}'`
      );
      expect(updatedPre.rows[0].phase).toBe('pre_processing');
      expect(updatedPre.rows[0].on_hold).toBe(false);

      const updatedRev = await client.query(
        `SELECT phase, on_hold FROM work_requests WHERE id = '${wrRev.rows[0].id}'`
      );
      expect(updatedRev.rows[0].phase).toBe('quality_assurance');

      const updatedComp = await client.query(
        `SELECT phase, on_hold FROM work_requests WHERE id = '${wrComp.rows[0].id}'`
      );
      expect(updatedComp.rows[0].phase).toBe('completion');

      // Verify task clamping (quality_assurance and completion parent -> processing task)
      const taskRev = await client.query(
        `SELECT phase FROM tasks WHERE work_request_id = '${wrRev.rows[0].id}'`
      );
      expect(taskRev.rows[0].phase).toBe('processing');

      const taskComp = await client.query(
        `SELECT phase FROM tasks WHERE work_request_id = '${wrComp.rows[0].id}'`
      );
      expect(taskComp.rows[0].phase).toBe('processing');

      // Verify report file on disk
      expect(fs.existsSync(applyReportPath)).toBe(true);
      const diskReport = JSON.parse(fs.readFileSync(applyReportPath, 'utf8'));
      expect(diskReport.mapped_records.length).toBe(3);
    });

    it('AC-3: Apply × 2 idempotency (second run reports 0 mutations)', async () => {
      const run1ReportPath = path.join(reportDir, 'idempotent-run1.json');
      const run2ReportPath = path.join(reportDir, 'idempotent-run2.json');

      const wr = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('WR Idemp', 'Processing') RETURNING id"
      );
      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${wr.rows[0].id}', 'Task Idemp')`
      );

      // Run 1
      const report1 = await runBackfill({
        client,
        apply: true,
        env: 'local',
        reportPath: run1ReportPath,
      });
      expect(report1.summary.total_work_requests_mutated).toBe(1);
      expect(report1.summary.total_tasks_mutated).toBe(1);

      // Run 2 (immediately executed on same DB)
      const report2 = await runBackfill({
        client,
        apply: true,
        env: 'local',
        reportPath: run2ReportPath,
      });

      // Second run reports 0 mutations
      expect(report2.summary.total_work_requests_mutated).toBe(0);
      expect(report2.summary.total_tasks_mutated).toBe(0);
      expect(report2.mapped_records.length).toBe(0);
    });

    it('AC-4: Seeded Cancelled WR remains completely untouched with phase = NULL', async () => {
      const cancelReportPath = path.join(reportDir, 'cancelled-report.json');

      // Seed Cancelled WR with tasks
      const wrCancel = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('Cancelled WR', 'Cancelled') RETURNING id"
      );
      const cancelId = wrCancel.rows[0].id;

      await client.query(
        `INSERT INTO tasks (work_request_id, title) VALUES ('${cancelId}', 'Cancelled Child Task')`
      );

      // Seed normal active WR alongside it
      await client.query("INSERT INTO work_requests (title, status) VALUES ('Active WR', 'Draft')");

      const report = await runBackfill({
        client,
        apply: true,
        env: 'local',
        reportPath: cancelReportPath,
      });

      expect(report.summary.total_cancelled_preserved).toBe(1);

      // Verify Cancelled WR remains completely unchanged
      const cancelRow = await client.query(
        `SELECT status, phase, on_hold FROM work_requests WHERE id = '${cancelId}'`
      );
      expect(cancelRow.rows[0].status).toBe('Cancelled');
      expect(cancelRow.rows[0].phase).toBeNull();
      expect(cancelRow.rows[0].on_hold).toBe(false);

      // Verify Cancelled child task phase remains NULL
      const cancelTaskRow = await client.query(
        `SELECT phase, qa_status FROM tasks WHERE work_request_id = '${cancelId}'`
      );
      expect(cancelTaskRow.rows[0].phase).toBeNull();
      expect(cancelTaskRow.rows[0].qa_status).toBe('none');
    });

    it('AC-5: Recovers On Hold status from status_history', async () => {
      const wrHold = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('Hold History WR', 'On Hold') RETURNING id"
      );
      const holdId = wrHold.rows[0].id;

      // Insert prior status in status_history
      await client.query(`
        INSERT INTO status_history (table_name, record_id, old_status, new_status)
        VALUES ('work_requests', '${holdId}', 'Processing', 'On Hold')
      `);

      // Test helper function directly
      const recovered = await recoverPriorStatus(client, holdId);
      expect(recovered).toBe('Processing');

      const report = await runBackfill({ client, apply: true, env: 'local' });

      expect(report.buckets.on_hold_recovered.wr_count).toBe(1);

      const updated = await client.query(
        `SELECT phase, on_hold FROM work_requests WHERE id = '${holdId}'`
      );
      expect(updated.rows[0].phase).toBe('processing');
      expect(updated.rows[0].on_hold).toBe(true);
    });

    it('AC-5: Recovers On Hold status from audit_logs', async () => {
      const wrHold = await client.query(
        "INSERT INTO work_requests (title, status) VALUES ('Hold Audit WR', 'On Hold') RETURNING id"
      );
      const holdId = wrHold.rows[0].id;

      // Insert prior status in audit_logs
      await client.query(`
        INSERT INTO audit_logs (table_name, record_id, action, details)
        VALUES ('work_requests', '${holdId}', 'update', '{"old_status": "For Review", "new_status": "On Hold"}'::jsonb)
      `);

      const report = await runBackfill({ client, apply: true, env: 'local' });

      expect(report.buckets.on_hold_recovered.wr_count).toBe(1);

      const updated = await client.query(
        `SELECT phase, on_hold FROM work_requests WHERE id = '${holdId}'`
      );
      expect(updated.rows[0].phase).toBe('quality_assurance');
      expect(updated.rows[0].on_hold).toBe(true);
    });

    it('AC-5: Captures unrecovered On Hold rows in ambiguous_inventory for Admin review', async () => {
      const ambReportPath = path.join(reportDir, 'ambiguous-report.json');

      const wrAmb = await client.query(
        "INSERT INTO work_requests (title, status, entity) VALUES ('Orphan Hold WR', 'On Hold', 'ATA') RETURNING id"
      );
      const ambId = wrAmb.rows[0].id;

      const report = await runBackfill({
        client,
        apply: true,
        env: 'local',
        reportPath: ambReportPath,
      });

      expect(report.summary.total_ambiguous_on_hold).toBe(1);
      expect(report.ambiguous_inventory.length).toBe(1);

      const item = report.ambiguous_inventory[0];
      expect(item.work_request_id).toBe(ambId);
      expect(item.title).toBe('Orphan Hold WR');
      expect(item.entity_id).toBe('ATA');
      expect(item.defaulted_phase).toBe('pre_processing');
      expect(item.reason).toContain('No status_history or audit_logs');

      // Database row defaulted to pre_processing with on_hold = true
      const updated = await client.query(
        `SELECT phase, on_hold FROM work_requests WHERE id = '${ambId}'`
      );
      expect(updated.rows[0].phase).toBe('pre_processing');
      expect(updated.rows[0].on_hold).toBe(true);
    });

    it('Safety: rejects running with apply against remote staging/production', async () => {
      await expect(runBackfill({ client, apply: true, env: 'staging' })).rejects.toThrow(
        /Operational Safety Violation/
      );
      await expect(runBackfill({ client, apply: true, env: 'prod' })).rejects.toThrow(
        /Operational Safety Violation/
      );
    });
  });
});
