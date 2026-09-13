/** @type {import('node-pg-migrate').Migration} */
exports.up = (pgm) => {
  pgm.sql(`
    -- Spec 1.6: migration 000033 deployed work_request_transition and
    -- task_transition with scalar parameter p_from_status text, while their
    -- bodies reference p_from_statuses (plural, array). Any invocation threw
    -- 'column or variable "p_from_statuses" does not exist'.
    --
    -- Drop the broken scalar signatures and recreate both procedures with
    -- p_from_statuses text[] so callers can supply one or more allowed
    -- predecessor statuses atomically guarded by status = ANY(...).

    DROP FUNCTION IF EXISTS public.work_request_transition(uuid, text, text, uuid, uuid, boolean);
    DROP FUNCTION IF EXISTS public.task_transition(uuid, uuid, text, text, uuid);

    -- NOTE: the spec blueprint for this fix included 'updated_by = p_user_id'
    -- in the SET clause, but the live work_requests schema has no updated_by
    -- column; writing it here would make every invocation throw. p_user_id is
    -- retained in the signature for interface stability with callers.
    CREATE OR REPLACE FUNCTION public.work_request_transition(
      p_id uuid,
      p_from_statuses text[],
      p_to_status text,
      p_user_id uuid,
      p_entity_id uuid,
      p_archived boolean DEFAULT NULL
    )
    RETURNS SETOF work_requests
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      RETURN QUERY
      UPDATE work_requests
      SET status = p_to_status,
          updated_at = now(),
          version = version + 1,
          archived = COALESCE(p_archived, archived)
      WHERE id = p_id
        AND entity_id = p_entity_id
        AND status = ANY(p_from_statuses)
      RETURNING *;
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.task_transition(
      p_id uuid,
      p_work_request_id uuid,
      p_from_statuses text[],
      p_to_status text,
      p_user_id uuid
    )
    RETURNS SETOF tasks
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      RETURN QUERY
      UPDATE tasks
      SET status = p_to_status,
          updated_at = now(),
          version = version + 1
      WHERE id = p_id
        AND work_request_id = p_work_request_id
        AND status = ANY(p_from_statuses)
      RETURNING *;
    END;
    $$;
  `);
};

/** @type {import('node-pg-migrate').Migration} */
exports.down = (pgm) => {
  pgm.sql(`
    -- Restore the exact (broken) 000033 scalar signatures for reversibility.
    DROP FUNCTION IF EXISTS public.work_request_transition(uuid, text[], text, uuid, uuid, boolean);
    DROP FUNCTION IF EXISTS public.task_transition(uuid, uuid, text[], text, uuid);

    CREATE OR REPLACE FUNCTION public.work_request_transition(
      p_id uuid,
      p_from_status text,
      p_to_status text,
      p_user_id uuid,
      p_entity_id uuid,
      p_archived boolean DEFAULT NULL
    )
    RETURNS SETOF work_requests
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      RETURN QUERY
      UPDATE work_requests
      SET status = p_to_status,
          updated_by = p_user_id,
          updated_at = now(),
          version = version + 1,
          archived = COALESCE(p_archived, archived)
      WHERE id = p_id
        AND entity_id = p_entity_id
        AND status = ANY(p_from_statuses)
      RETURNING *;
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.task_transition(
      p_id uuid,
      p_work_request_id uuid,
      p_from_status text,
      p_to_status text,
      p_user_id uuid
    )
    RETURNS SETOF tasks
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      RETURN QUERY
      UPDATE tasks
      SET status = p_to_status,
          updated_at = now(),
          version = version + 1
      WHERE id = p_id
        AND work_request_id = p_work_request_id
        AND status = ANY(p_from_statuses)
      RETURNING *;
    END;
    $$;
  `);
};
