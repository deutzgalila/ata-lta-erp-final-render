/**
 * Migration 000055: Retainer Recurrence & Template Generations
 *
 * Adds manual annual recurrence support to retainer_templates and creates
 * the retainer_template_generations audit table with an anti-duplicate
 * unique constraint on (template_id, period_label).
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  // 1. Add recurrence column to retainer_templates
  pgm.sql(`
    ALTER TABLE retainer_templates
      ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none'
      CHECK (recurrence IN ('none', 'annual'));
  `);

  // 2. Create retainer_template_generations table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS retainer_template_generations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id uuid NOT NULL REFERENCES retainer_templates(id) ON DELETE CASCADE,
      work_request_id uuid NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
      period_label text,
      generated_by uuid NOT NULL REFERENCES users(id),
      generated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_retainer_template_generations_period UNIQUE (template_id, period_label)
    );

    CREATE INDEX IF NOT EXISTS idx_retainer_template_generations_template_id
      ON retainer_template_generations (template_id);

    CREATE INDEX IF NOT EXISTS idx_retainer_template_generations_work_request_id
      ON retainer_template_generations (work_request_id);
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_retainer_template_generations_work_request_id;
    DROP INDEX IF EXISTS idx_retainer_template_generations_template_id;
    DROP TABLE IF EXISTS retainer_template_generations;

    ALTER TABLE retainer_templates
      DROP COLUMN IF EXISTS recurrence;
  `);
};
