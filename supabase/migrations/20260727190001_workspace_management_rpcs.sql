CREATE OR REPLACE FUNCTION public.rename_workspace(workspace_id UUID, new_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(trim(new_name)) < 2 THEN
    RAISE EXCEPTION 'Workspace name must be at least 2 characters';
  END IF;

  UPDATE public.workspaces
  SET name = trim(new_name)
  WHERE id = workspace_id
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = public.workspaces.id
        AND wm.user_id = current_user_id
        AND wm.role = 'owner'
    );

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_workspace_by_id(workspace_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.workspaces
  WHERE id = workspace_id
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = public.workspaces.id
        AND wm.user_id = current_user_id
        AND wm.role = 'owner'
    );

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rename_workspace(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_workspace_by_id(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
