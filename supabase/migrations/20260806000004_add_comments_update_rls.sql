-- ----------------------------------------------------------------------------
-- Add missing UPDATE RLS policy for comments
-- ----------------------------------------------------------------------------

CREATE POLICY "Authors and managers can update comments" 
  ON public.comments
  FOR UPDATE
  TO authenticated
  USING (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND (comments.user_id = auth.uid() OR wm.role IN ('owner', 'maintainer'))
    )
  );
