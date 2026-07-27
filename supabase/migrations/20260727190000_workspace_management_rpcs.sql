-- ========================================================
-- 4. RPC ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ВОРКСПЕЙСАМИ
-- ========================================================

CREATE OR REPLACE FUNCTION public.update_workspace_name(
  workspace_id UUID,
  new_name TEXT
)
RETURNS TEXT AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_role workspace_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF new_name IS NULL OR length(trim(new_name)) < 2 THEN
    RAISE EXCEPTION 'Workspace name must be at least 2 characters';
  END IF;

  SELECT wm.role INTO current_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = update_workspace_name.workspace_id
    AND wm.user_id = current_user_id;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF current_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can rename this workspace';
  END IF;

  UPDATE public.workspaces
  SET name = trim(new_name)
  WHERE id = update_workspace_name.workspace_id;

  RETURN trim(new_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_workspace_name(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_workspace(
  workspace_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_role workspace_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT wm.role INTO current_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = delete_workspace.workspace_id
    AND wm.user_id = current_user_id;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF current_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can delete this workspace';
  END IF;

  DELETE FROM public.workspace_members
  WHERE workspace_id = delete_workspace.workspace_id;

  DELETE FROM public.workspaces
  WHERE id = delete_workspace.workspace_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_workspace(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
