/**
 * Migration 000057: Add task_id column to invoices and disbursements tables.
 *
 * Requirements:
 * - Add task_id UUID REFERENCES tasks(id) ON DELETE SET NULL to invoices and disbursements.
 * - Backfill task_id from existing linked_task_id where task_id is NULL.
 * - Create indexes on task_id for fast relational queries.
 * - Update invoice_create_transactional and invoice_update_transactional stored procedures
 *   to dual-write task_id and linked_task_id.
 *
 * @type {import('node-pg-migrate').Migration}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Invoices: add column, index, and backfill from linked_task_id
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_invoices_task_id
      ON invoices(task_id);

    UPDATE invoices
      SET task_id = linked_task_id
      WHERE task_id IS NULL AND linked_task_id IS NOT NULL;

    -- 2. Disbursements: add column, index, and backfill from linked_task_id
    ALTER TABLE disbursements
      ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_disbursements_task_id
      ON disbursements(task_id);

    UPDATE disbursements
      SET task_id = linked_task_id
      WHERE task_id IS NULL AND linked_task_id IS NOT NULL;

    -- 3. Update invoice_create_transactional to dual-write task_id and linked_task_id
    CREATE OR REPLACE FUNCTION public.invoice_create_transactional(
      p_invoice_data jsonb,
      p_line_items jsonb,
      p_user_id uuid,
      p_entity_id uuid
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_invoice invoices%ROWTYPE;
      v_item jsonb;
      v_idx integer := 0;
      v_effective_task_id uuid;
    BEGIN
      v_effective_task_id := COALESCE(
        (p_invoice_data->>'taskId')::uuid,
        (p_invoice_data->>'task_id')::uuid,
        (p_invoice_data->>'linkedTaskId')::uuid
      );

      INSERT INTO invoices (
        id, entity_id, client_id, work_request_id, linked_task_id, task_id,
        linked_transmittal_id, invoice_number,
        issue_date, due_date, status, subtotal, tax_amount, total,
        amount_paid, balance, notes, terms, created_by, updated_by, version
      ) VALUES (
        COALESCE((p_invoice_data->>'id')::uuid, gen_random_uuid()),
        p_entity_id,
        (p_invoice_data->>'clientId')::uuid,
        (p_invoice_data->>'workRequestId')::uuid,
        v_effective_task_id,
        v_effective_task_id,
        (p_invoice_data->>'linkedTransmittalId')::uuid,
        p_invoice_data->>'invoiceNumber',
        (p_invoice_data->>'issueDate')::date,
        (p_invoice_data->>'dueDate')::date,
        COALESCE(p_invoice_data->>'status', 'Draft'),
        (p_invoice_data->>'subtotal')::numeric,
        0,
        (p_invoice_data->>'total')::numeric,
        0,
        (p_invoice_data->>'total')::numeric,
        p_invoice_data->>'notes',
        p_invoice_data->>'terms',
        p_user_id,
        p_user_id,
        1
      ) RETURNING * INTO v_invoice;

      FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
      LOOP
        INSERT INTO invoice_line_items (
          invoice_id, description, amount, type, sort_order
        ) VALUES (
          v_invoice.id,
          v_item->>'description',
          (v_item->>'amount')::numeric,
          COALESCE(v_item->>'type', 'Professional Fee'),
          v_idx
        );
        v_idx := v_idx + 1;
      END LOOP;

      RETURN to_jsonb(v_invoice);
    END;
    $$;

    -- 4. Update invoice_update_transactional to dual-write task_id and linked_task_id
    CREATE OR REPLACE FUNCTION public.invoice_update_transactional(
      p_invoice_id uuid,
      p_updates jsonb,
      p_line_items jsonb,
      p_user_id uuid,
      p_entity_id uuid,
      p_expected_version integer DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_invoice invoices%ROWTYPE;
      v_item jsonb;
      v_idx integer := 0;
      v_subtotal numeric;
      v_has_task_update boolean := false;
      v_effective_task_id uuid := NULL;
    BEGIN
      IF p_line_items IS NOT NULL THEN
        DELETE FROM invoice_line_items WHERE invoice_id = p_invoice_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
        LOOP
          INSERT INTO invoice_line_items (
            invoice_id, description, amount, type, sort_order
          ) VALUES (
            p_invoice_id,
            v_item->>'description',
            (v_item->>'amount')::numeric,
            COALESCE(v_item->>'type', 'Professional Fee'),
            v_idx
          );
          v_idx := v_idx + 1;
        END LOOP;

        SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
        FROM invoice_line_items
        WHERE invoice_id = p_invoice_id;
      END IF;

      IF (p_updates ? 'task_id') OR (p_updates ? 'linked_task_id') OR (p_updates ? 'taskId') OR (p_updates ? 'linkedTaskId') THEN
        v_has_task_update := true;
        v_effective_task_id := COALESCE(
          (p_updates->>'task_id')::uuid,
          (p_updates->>'taskId')::uuid,
          (p_updates->>'linked_task_id')::uuid,
          (p_updates->>'linkedTaskId')::uuid
        );
      END IF;

      UPDATE invoices SET
        client_id             = CASE WHEN p_updates ? 'client_id'             THEN (p_updates->>'client_id')::uuid   ELSE client_id END,
        work_request_id       = CASE WHEN p_updates ? 'work_request_id'       THEN (p_updates->>'work_request_id')::uuid ELSE work_request_id END,
        linked_task_id        = CASE WHEN v_has_task_update                   THEN v_effective_task_id               ELSE linked_task_id END,
        task_id               = CASE WHEN v_has_task_update                   THEN v_effective_task_id               ELSE task_id END,
        linked_transmittal_id = CASE WHEN p_updates ? 'linked_transmittal_id' THEN (p_updates->>'linked_transmittal_id')::uuid ELSE linked_transmittal_id END,
        invoice_number        = CASE WHEN p_updates ? 'invoice_number'        THEN p_updates->>'invoice_number'      ELSE invoice_number END,
        issue_date            = CASE WHEN p_updates ? 'issue_date'            THEN (p_updates->>'issue_date')::date  ELSE issue_date END,
        due_date              = CASE WHEN p_updates ? 'due_date'              THEN (p_updates->>'due_date')::date    ELSE due_date END,
        status                = CASE WHEN p_updates ? 'status'                THEN p_updates->>'status'              ELSE status END,
        notes                 = CASE WHEN p_updates ? 'notes'                 THEN p_updates->>'notes'               ELSE notes END,
        terms                 = CASE WHEN p_updates ? 'terms'                 THEN p_updates->>'terms'               ELSE terms END,
        archived              = CASE WHEN p_updates ? 'archived'              THEN (p_updates->>'archived')::boolean ELSE archived END,
        subtotal              = COALESCE(v_subtotal, subtotal),
        total                 = COALESCE(v_subtotal, total),
        balance               = CASE WHEN v_subtotal IS NOT NULL THEN v_subtotal - amount_paid ELSE balance END,
        updated_by            = p_user_id,
        updated_at            = now(),
        version               = version + 1
      WHERE id = p_invoice_id
        AND entity_id = p_entity_id
        AND (p_expected_version IS NULL OR version = p_expected_version)
      RETURNING * INTO v_invoice;

      IF NOT FOUND THEN
        RETURN NULL;
      END IF;

      RETURN to_jsonb(v_invoice);
    END;
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_disbursements_task_id;
    ALTER TABLE disbursements DROP COLUMN IF EXISTS task_id;
    DROP INDEX IF EXISTS idx_invoices_task_id;
    ALTER TABLE invoices DROP COLUMN IF EXISTS task_id;
  `);
};
