BEGIN;

-- =============================================================================
-- 8. Fix remove_member — add SET search_path and use SECURITY DEFINER helper
--    functions for permission checks instead of raw SELECTs that may hit RLS
--    recursion / policy issues.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_member(
  p_workspace_id   uuid,
  p_target_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_caller_role     TEXT;
  v_target_role     TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Get caller's role via SECURITY DEFINER helper (bypasses RLS)
  v_caller_role := public.get_user_workspace_role(p_workspace_id, v_current_user_id);

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can remove members';
  END IF;

  -- 2. Get target's role via SECURITY DEFINER helper
  v_target_role := public.get_user_workspace_role(p_workspace_id, p_target_user_id);

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove an owner';
  END IF;

  -- 3. Delete the member
  DELETE FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_target_user_id;

  -- 4. Activity log
  INSERT INTO public.activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    p_workspace_id,
    v_current_user_id,
    'member_removed',
    jsonb_build_object('target_user_id', p_target_user_id)
  );

  RETURN 'Member removed';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_member(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_member(uuid, uuid) TO service_role;

-- =============================================================================
-- 9. Fix change_member_role — same RLS fix: use SECURITY DEFINER helper
--    functions instead of raw SELECTs on workspace_members.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_workspace_id   uuid,
  p_target_user_id uuid,
  p_new_role       public.workspace_role
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_caller_role     TEXT;
  v_target_role     TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller's role via SECURITY DEFINER helper (bypasses RLS)
  v_caller_role := public.get_user_workspace_role(p_workspace_id, v_current_user_id);

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can change member roles';
  END IF;

  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot assign owner role directly';
  END IF;

  -- Get target's role via SECURITY DEFINER helper
  v_target_role := public.get_user_workspace_role(p_workspace_id, p_target_user_id);

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot change the owner role';
  END IF;

  -- Update role
  UPDATE public.workspace_members
  SET role = p_new_role
  WHERE workspace_id = p_workspace_id
    AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Activity log
  INSERT INTO public.activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    p_workspace_id,
    v_current_user_id,
    'role_changed',
    jsonb_build_object('target_user_id', p_target_user_id, 'new_role', p_new_role::text, 'old_role', v_target_role)
  );

  RETURN 'Member role updated';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) TO authenticated;
GRANT ALL ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) TO anon;
GRANT ALL ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) TO service_role;

COMMIT;
