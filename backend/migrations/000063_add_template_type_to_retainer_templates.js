/**
 * Migration 000063: Add template_type to retainer_templates
 *
 * Adds template_type column defaulting to 'retainer' and partial index
 * on (entity_id, template_type) where deleted_at IS NULL.
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE retainer_templates
      ADD COLUMN IF NOT EXISTS template_type VARCHAR(50) NOT NULL DEFAULT 'retainer';

    CREATE INDEX IF NOT EXISTS idx_retainer_templates_entity_id_template_type
      ON retainer_templates (entity_id, template_type)
      WHERE deleted_at IS NULL;
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_retainer_templates_entity_id_template_type;

    ALTER TABLE retainer_templates
      DROP COLUMN IF EXISTS template_type;
  `);
};
