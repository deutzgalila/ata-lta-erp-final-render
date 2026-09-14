/**
 * Spec 2.3/2.4 (R-11): concurrency-safe document sequence generation and
 * atomic multi-row invoice mutations.
 *
 * 1. document_sequences + next_document_sequence(): count(*)-based number
 *    generation raced under concurrent creates (two requests read the same
 *    count and produced colliding disbursement numbers). The upsert inside a
 *    single statement takes a row lock on the prefix, serializing allocation.
 *
 * 2. invoice_create_transactional() / invoice_update_transactional(): the
 *    application previously inserted the invoice, then the line items, in a
 *    second PostgREST round-trip and attempted a best-effort delete() rollback
 *    on failure. Network partitions or container crashes after the first call
 *    left orphaned PHP 0 invoices. Both steps now run inside one implicit
 *    PostgreSQL function transaction — any constraint violation aborts both.
 *
 * Deviations from the spec blueprint (kept deliberately, documented here):
 *   - The blueprint's invoice INSERT omitted columns the real service writes
 *     (linked_task_id, linked_transmittal_id, tax_amount). Shipping it as-is
 *     would have silently dropped those fields. They are accepted here via
 *     p_invoice_data keys linkedTaskId / linkedTransmittalId.
 *   - invoice_update_transactional additionally takes p_expected_version
 *     (default NULL) so the OCC stale-write guard (Spec 2.2 / R-10) can be
 *     enforced inside the same atomic statement; when provided and the stored
 *     version differs, the function returns NULL and the service maps that to
 *     a 409 conflict.
 */

/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  // ─── 1. Atomic, concurrency-safe document sequence generation ────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS public.document_sequences (
      prefix text PRIMARY KEY,
      current_val integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION public.next_document_sequence(p_prefix text)
    RETURNS text
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_seq integer;
    BEGIN
      INSERT INTO document_sequences (prefix, current_val, updated_at)
      VALUES (p_prefix, 1, now())
      ON CONFLICT (prefix)
      DO UPDATE SET current_val = document_sequences.current_val + 1, updated_at = now()
      RETURNING current_val INTO v_seq;

      RETURN p_prefix || '-' || LPAD(v_seq::text, 4, '0');
    END;
    $$;
  `);

  // ─── 2. Atomic invoice creation (invoice + line items, one txn) ──────
  pgm.sql(`
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
    BEGIN
      INSERT INTO invoices (
        id, entity_id, client_id, work_request_id, linked_task_id,
        linked_transmittal_id, invoice_number,
        issue_date, due_date, status, subtotal, tax_amount, total,
        amount_paid, balance, notes, terms, created_by, updated_by, version
      ) VALUES (
        COALESCE((p_invoice_data->>'id')::uuid, gen_random_uuid()),
        p_entity_id,
        (p_invoice_data->>'clientId')::uuid,
        (p_invoice_data->>'workRequestId')::uuid,
        (p_invoice_data->>'linkedTaskId')::uuid,
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

      -- Insert line items atomically inside the same function transaction.
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
  `);

  // ─── 3. Atomic invoice update (fields + line item replacement) ───────
  pgm.sql(`
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
    BEGIN
      -- Replace line items first; if any item violates a constraint the whole
      -- function transaction aborts and the invoice row is left untouched.
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

      -- (p_updates ? key) distinguishes "set this column to the provided
      -- value (possibly NULL)" from "column not provided, keep current".
      UPDATE invoices SET
        client_id             = CASE WHEN p_updates ? 'client_id'             THEN (p_updates->>'client_id')::uuid   ELSE client_id END,
        work_request_id       = CASE WHEN p_updates ? 'work_request_id'       THEN (p_updates->>'work_request_id')::uuid ELSE work_request_id END,
        linked_task_id        = CASE WHEN p_updates ? 'linked_task_id'        THEN (p_updates->>'linked_task_id')::uuid ELSE linked_task_id END,
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
        -- Recompute the balance from the row's current amount_paid in the
        -- same transaction, removing the read-modify-write race the old
        -- two-round-trip application flow had.
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

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS public.invoice_update_transactional(uuid, jsonb, jsonb, uuid, uuid, integer);
    DROP FUNCTION IF EXISTS public.invoice_create_transactional(jsonb, jsonb, uuid, uuid);
    DROP FUNCTION IF EXISTS public.next_document_sequence(text);
    DROP TABLE IF EXISTS public.document_sequences;
  `);
};
