/**
 * Migration 000053: Superset Status Constraint
 *
 * Broadens the work_requests.status CHECK constraint to a superset
 * preserving all 10 legacy lifecycle statuses plus 'Quality Assurance'.
 *
 * This ensures that existing endpoints, background jobs, and tests continue
 * functioning without breaking during the phase model transition.
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE work_requests
      DROP CONSTRAINT IF EXISTS chk_work_requests_status,
      ADD CONSTRAINT chk_work_requests_status
      CHECK (status IN (
        'Draft',
        'Pre-processing',
        'In Progress',
        'Processing',
        'For Review',
        'Quality Assurance',
        'Billing',
        'Disbursement',
        'On Hold',
        'Completed',
        'Cancelled'
      ));
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE work_requests
      DROP CONSTRAINT IF EXISTS chk_work_requests_status,
      ADD CONSTRAINT chk_work_requests_status
      CHECK (status IN (
        'Draft',
        'Pre-processing',
        'In Progress',
        'Processing',
        'For Review',
        'Billing',
        'Disbursement',
        'On Hold',
        'Completed',
        'Cancelled'
      ));
  `);
};
