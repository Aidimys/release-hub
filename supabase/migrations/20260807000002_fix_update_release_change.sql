BEGIN;

-- =============================================================================
-- Fix update_release_change: the previous implementation resolved workspace_id
-- from `(SELECT release_id FROM public.release_changes ...)`, i.e. it used the
-- release's UUID as a workspace UUID. That never matches a workspace_members
-- row, so the membership guard always returned NULL and the function raised
-- "Not a workspace member" for every caller, making change edits impossible.
-- It also used `FOR UPDATE OF r` where no alias `r` exists.
--
-- The corrected version resolves the workspace through
-- release_changes -> releases -> products -> workspace_members and also
-- performs the optimistic-concurrency (updated_at) check on the *change's*
-- own updated_at, matching update_release_comment.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_release_change(
  p_change_id          uuid,
  p_category           public.change_category,
  p_title              text,
  p_description        text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.release_changes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_change              public.release_changes%ROWTYPE;
  v_release             public.releases%ROWTYPE;
  v_user_id             UUID := auth.uid();
  v_user_role           TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Load the change row first (we need release_id to resolve the workspace)
  SELECT * INTO v_change FROM public.release_changes WHERE id = p_change_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change not found';
  END IF;

  -- 2. Resolve the caller's role for the workspace that owns this change
  SELECT wm.role
  INTO v_user_role
  FROM public.releases r
  JOIN public.products p         ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
  WHERE r.id = v_change.release_id
    AND wm.user_id = v_user_id
  ORDER BY CASE wm.role WHEN 'owner' THEN 1 WHEN 'maintainer' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  IF v_user_role NOT IN ('owner', 'maintainer') THEN
    RAISE EXCEPTION 'Only owners and maintainers can edit release changes';
  END IF;

  -- 3. Lock the release row (prevents concurrent status changes mid-edit)
  SELECT * INTO v_release FROM public.releases WHERE id = v_change.release_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release not found';
  END IF;

  -- 4. Optimistic locking on the change's own updated_at (NOT the release's)
  IF p_expected_updated_at IS NOT NULL AND v_change.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Change has been modified by another user. Please refresh.';
  END IF;

  -- 5. Update the change (status of the release is intentionally left untouched)
  UPDATE public.release_changes
  SET category = p_category,
      title = p_title,
      description = p_description,
      updated_at = now()
  WHERE id = p_change_id
  RETURNING * INTO v_change;

  -- 6. Bump the release's updated_at so callers know it changed (status untouched)
  UPDATE public.releases
  SET updated_at = now()
  WHERE id = v_change.release_id;

  RETURN v_change;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_release_change(uuid, public.change_category, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_release_change(uuid, public.change_category, text, text, timestamptz) TO service_role;

COMMIT;
