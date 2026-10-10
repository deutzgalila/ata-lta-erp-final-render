/**
 * Migration 000059: Add 'For Billing' to Work Request Statuses
 *
 * 000058 expanded the work_requests.status CHECK constraint with the nine
 * workflow statuses but omitted 'For Billing', which the SPA exposes in
 * WORK_REQUEST_STATUS_OPTIONS (and WR_STATUSES in operations/schema.js).
 * Admin status updates to 'For Billing' therefore failed with
 * 400 VALIDATION_ERROR (observed as the optimistic chip flipping, then
 * rolling back). Recreate the CHECK with 'For Billing' included.
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
        'For Billing',
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
