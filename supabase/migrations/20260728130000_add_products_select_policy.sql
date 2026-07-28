-- Add missing SELECT policy for workspace products.
-- This migration is created separately because existing migration files may already
-- have been applied and will not be re-run by supabase db push.

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view products in same workspace" ON public.products;
CREATE POLICY "Members can view products in same workspace"
  ON public.products FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );
