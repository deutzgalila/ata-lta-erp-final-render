/**
 * Migration 000058: Expand Work Request Statuses
 *
 * Broadens the work_requests.status CHECK constraint to include workflow statuses:
 * Received, For Client Approval, For Requirements, Pending Requirements,
 * For Assignment, For Supervisor Review, For Payment, For Submission,
 * For Quality Check, while preserving existing statuses.
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
        'Cancelled',
        'Received',
        'For Client Approval',
        'For Requirements',
        'Pending Requirements',
        'For Assignment',
        'For Supervisor Review',
        'For Payment',
        'For Submission',
        'For Quality Check'
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
        'Quality Assurance',
        'Billing',
        'Disbursement',
        'On Hold',
        'Completed',
        'Cancelled'
      ));
  `);
};
