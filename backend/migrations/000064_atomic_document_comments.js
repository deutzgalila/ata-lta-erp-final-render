/** Atomic comment mutations; callable only by the trusted backend service role. */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION public.mutate_document_comment(
      p_entity_id uuid, p_document_id uuid, p_comment_id text,
      p_user_id uuid, p_text text, p_action text
    ) RETURNS jsonb
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
    AS $$
    DECLARE
      doc public.documents%ROWTYPE;
      actor public.users%ROWTYPE;
      thread jsonb;
      target jsonb;
      position integer;
      stamp timestamptz;
    BEGIN
      IF p_action IS NULL OR p_action NOT IN ('add', 'edit', 'delete') THEN
        RAISE EXCEPTION 'Invalid comment action' USING ERRCODE = '22023';
      END IF;
      IF p_action <> 'delete' AND (p_text IS NULL OR length(btrim(p_text)) NOT BETWEEN 1 AND 4000) THEN
        RAISE EXCEPTION 'Comment text must contain 1 to 4000 characters' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO actor FROM public.users WHERE id = p_user_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Active user required' USING ERRCODE = '42501';
      END IF;
      SELECT * INTO doc FROM public.documents
        WHERE id = p_document_id AND entity_id = p_entity_id AND deleted_at IS NULL
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
      END IF;
      thread := coalesce(doc.comments, '[]'::jsonb);
      stamp := clock_timestamp();
      IF p_action = 'add' THEN
        thread := thread || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(), 'userId', actor.id, 'userName', actor.name,
          'date', stamp, 'text', btrim(p_text)
        ));
      ELSE
        SELECT item, (ordinality - 1)::integer INTO target, position
          FROM jsonb_array_elements(thread) WITH ORDINALITY AS entry(item, ordinality)
          WHERE item->>'id' = p_comment_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'P0002';
        END IF;
        IF coalesce(target->>'userId', target->>'user_id', '') <> p_user_id::text
          AND NOT (p_action = 'delete' AND actor.role = 'Admin') THEN
          RAISE EXCEPTION 'You cannot modify this comment' USING ERRCODE = '42501';
        END IF;
        IF p_action = 'delete' THEN
          thread := thread - position;
        ELSE
          thread := jsonb_set(thread, ARRAY[position::text], target || jsonb_build_object(
            'text', btrim(p_text), 'edited', true, 'edited_at', stamp
          ));
        END IF;
      END IF;
      UPDATE public.documents SET comments = thread, updated_by = actor.id, updated_at = stamp
        WHERE id = doc.id RETURNING * INTO doc;
      RETURN to_jsonb(doc);
    END;
    $$;
    REVOKE ALL ON FUNCTION public.mutate_document_comment(uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mutate_document_comment(uuid, uuid, text, uuid, text, text) TO service_role;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS public.mutate_document_comment(uuid, uuid, text, uuid, text, text)');
};
