-- Allow workspace owners and maintainers to manage member records.

DROP POLICY IF EXISTS "Owners and maintainers can insert workspace members" ON public.workspace_members;
CREATE POLICY "Owners and maintainers can insert workspace members"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members AS manager_members
      WHERE manager_members.workspace_id = workspace_members.workspace_id
        AND manager_members.user_id = auth.uid()
        AND manager_members.role IN ('owner', 'maintainer')
    )
    AND workspace_members.role <> 'owner'
  );

DROP POLICY IF EXISTS "Owners and maintainers can update workspace members" ON public.workspace_members;
CREATE POLICY "Owners and maintainers can update workspace members"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members AS manager_members
      WHERE manager_members.workspace_id = workspace_members.workspace_id
        AND manager_members.user_id = auth.uid()
        AND manager_members.role IN ('owner', 'maintainer')
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspace_members AS manager_members
        WHERE manager_members.workspace_id = workspace_members.workspace_id
          AND manager_members.user_id = auth.uid()
          AND manager_members.role = 'owner'
      )
      OR workspace_members.role <> 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members AS manager_members
      WHERE manager_members.workspace_id = workspace_members.workspace_id
        AND manager_members.user_id = auth.uid()
        AND manager_members.role IN ('owner', 'maintainer')
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspace_members AS manager_members
        WHERE manager_members.workspace_id = workspace_members.workspace_id
          AND manager_members.user_id = auth.uid()
          AND manager_members.role = 'owner'
      )
      OR role <> 'owner'
    )
  );

DROP POLICY IF EXISTS "Owners and maintainers can delete workspace members" ON public.workspace_members;
CREATE POLICY "Owners and maintainers can delete workspace members"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members AS manager_members
      WHERE manager_members.workspace_id = workspace_members.workspace_id
        AND manager_members.user_id = auth.uid()
        AND manager_members.role IN ('owner', 'maintainer')
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspace_members AS manager_members
        WHERE manager_members.workspace_id = workspace_members.workspace_id
          AND manager_members.user_id = auth.uid()
          AND manager_members.role = 'owner'
      )
      OR workspace_members.role <> 'owner'
    )
  );
