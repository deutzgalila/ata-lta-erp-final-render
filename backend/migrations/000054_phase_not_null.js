/**
 * Migration 000054: Phase NOT NULL Enforcement (P3 Cutover Window Only)
 *
 * ⚠️ WARNING: CUTOVER REHEARSAL & PRODUCTION WINDOW ONLY (PARCEL P3).
 * DO NOT RUN THIS MIGRATION AS PART OF NORMAL STAGING OR CI CADENCE.
 *
 * Enforces that all active (non-cancelled) work requests and tasks
 * have a valid phase assigned. This migration must only execute AFTER
 * the backfill-phases script has successfully promoted all existing data.
 *
 * In PostgreSQL, conditional non-nullability (exempting Cancelled rows)
 * is enforced via table CHECK constraints:
 * - work_requests: status = 'Cancelled' OR phase IS NOT NULL
 * - tasks: status = 'Cancelled' OR phase IS NOT NULL
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- Enforce phase NOT NULL for all active work requests
    ALTER TABLE work_requests
      DROP CONSTRAINT IF EXISTS chk_work_requests_phase_not_null,
      ADD CONSTRAINT chk_work_requests_phase_not_null
      CHECK (status = 'Cancelled' OR phase IS NOT NULL);

    -- Enforce phase NOT NULL for all active tasks
    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS chk_tasks_phase_not_null,
      ADD CONSTRAINT chk_tasks_phase_not_null
      CHECK (status = 'Cancelled' OR phase IS NOT NULL);
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS chk_tasks_phase_not_null;

    ALTER TABLE work_requests
      DROP CONSTRAINT IF EXISTS chk_work_requests_phase_not_null;
  `);
};
