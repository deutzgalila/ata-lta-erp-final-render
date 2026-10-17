/**
 * Migration 000052: Phase Model Columns & Task Assignees
 *
 * Adds phase tracking, QA review status, and assignment attribution to
 * work_requests and tasks, and creates the task_assignees join table.
 *
 * Phase columns remain nullable initially to allow gradual promotion
 * via backfill-phases script.
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  // 1. work_requests additions: phase, phase_entered_at, on_hold
  pgm.sql(`
    ALTER TABLE work_requests
      ADD COLUMN IF NOT EXISTS phase text,
      ADD COLUMN IF NOT EXISTS phase_entered_at timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false;

    ALTER TABLE work_requests
      DROP CONSTRAINT IF EXISTS chk_work_requests_phase,
      ADD CONSTRAINT chk_work_requests_phase
      CHECK (phase IS NULL OR phase IN ('pre_processing', 'processing', 'quality_assurance', 'completion'));

    CREATE INDEX IF NOT EXISTS idx_work_requests_phase
      ON work_requests (phase);

    CREATE INDEX IF NOT EXISTS idx_work_requests_on_hold
      ON work_requests (on_hold) WHERE on_hold = true;
  `);

  // 2. tasks additions: phase, qa_status, assigned_by, assigned_at
  pgm.sql(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS phase text,
      ADD COLUMN IF NOT EXISTS qa_status text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();

    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS chk_tasks_phase,
      ADD CONSTRAINT chk_tasks_phase
      CHECK (phase IS NULL OR phase IN ('pre_processing', 'processing'));

    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS chk_tasks_qa_status,
      ADD CONSTRAINT chk_tasks_qa_status
      CHECK (qa_status IN ('none', 'passed', 'failed'));

    CREATE INDEX IF NOT EXISTS idx_tasks_phase
      ON tasks (phase);

    CREATE INDEX IF NOT EXISTS idx_tasks_qa_status
      ON tasks (qa_status);
  `);

  // 3. task_assignees join table for multi-assignee attribution
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_task_assignees_task_user UNIQUE (task_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id
      ON task_assignees (task_id);

    CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id
      ON task_assignees (user_id);
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS task_assignees;

    DROP INDEX IF EXISTS idx_tasks_qa_status;
    DROP INDEX IF EXISTS idx_tasks_phase;

    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS chk_tasks_qa_status,
      DROP CONSTRAINT IF EXISTS chk_tasks_phase,
      DROP COLUMN IF EXISTS assigned_at,
      DROP COLUMN IF EXISTS assigned_by,
      DROP COLUMN IF EXISTS qa_status,
      DROP COLUMN IF EXISTS phase;

    DROP INDEX IF EXISTS idx_work_requests_on_hold;
    DROP INDEX IF EXISTS idx_work_requests_phase;

    ALTER TABLE work_requests
      DROP CONSTRAINT IF EXISTS chk_work_requests_phase,
      DROP COLUMN IF EXISTS on_hold,
      DROP COLUMN IF EXISTS phase_entered_at,
      DROP COLUMN IF EXISTS phase;
  `);
};
