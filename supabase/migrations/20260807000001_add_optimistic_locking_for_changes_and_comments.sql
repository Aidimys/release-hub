BEGIN;

-- =============================================================================
-- Add optimistic locking RPCs for release_changes and comments updates
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_release_change(
  p_change_id        uuid,
  p_category         public.change_category,
  p_title            text,
  p_description      text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.release_changes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_change          public.release_changes%ROWTYPE;
  v_release         public.releases%ROWTYPE;
  v_user_id         UUID := auth.uid();
  v_user_role       TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE user_id = v_user_id
    AND workspace_id = (SELECT release_id FROM public.release_changes WHERE id = p_change_id)
  ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'maintainer' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  IF v_user_role NOT IN ('owner', 'maintainer') THEN
    RAISE EXCEPTION 'Only owners and maintainers can edit release changes';
  END IF;

  SELECT * INTO v_change FROM public.release_changes WHERE id = p_change_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change not found';
  END IF;

  SELECT * INTO v_release FROM public.releases WHERE id = v_change.release_id FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release not found';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_change.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Change has been modified by another user. Please refresh.';
  END IF;

  UPDATE public.release_changes
  SET category = p_category,
      title = p_title,
      description = p_description,
      updated_at = now()
  WHERE id = p_change_id
  RETURNING * INTO v_change;

  UPDATE public.releases
  SET updated_at = now()
  WHERE id = v_change.release_id;

  RETURN v_change;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_release_change(uuid, public.change_category, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_release_change(uuid, public.change_category, text, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.update_release_comment(
  p_comment_id      uuid,
  p_content         text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comment         public.comments%ROWTYPE;
  v_user_id         UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_user_id != (SELECT user_id FROM public.comments WHERE id = p_comment_id) THEN
    RAISE EXCEPTION 'You can only edit your own comments';
  END IF;

  SELECT * INTO v_comment FROM public.comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_comment.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Comment has been modified by another user. Please refresh.';
  END IF;

  UPDATE public.comments
  SET content = p_content,
      updated_at = now()
  WHERE id = p_comment_id
  RETURNING * INTO v_comment;

  RETURN v_comment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_release_comment(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_release_comment(uuid, text, timestamptz) TO service_role;

COMMIT;
