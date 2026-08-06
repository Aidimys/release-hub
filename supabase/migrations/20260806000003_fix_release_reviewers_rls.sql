-- Migration: Fix RLS Policies for release_reviewers
-- Description: Adds scoped SELECT, INSERT, UPDATE, and DELETE RLS policies for release reviewers.

BEGIN;

-- 1. Создаем SECURITY DEFINER helper-функцию для безопасного получения workspace_id по release_id
CREATE OR REPLACE FUNCTION public.get_release_workspace_id(p_release_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT p.workspace_id
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  WHERE r.id = p_release_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_release_workspace_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_release_workspace_id(uuid) TO authenticated;

-- 2. Удаляем существующие политики таблицы release_reviewers
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'release_reviewers'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.release_reviewers', pol.policyname);
    END LOOP;
END $$;

-- 3. Создаем RLS-политики

-- SELECT: Участники воркспейса могут просматривать рецензентов релизов своего воркспейса
CREATE POLICY "rr_select_policy"
  ON public.release_reviewers
  FOR SELECT
  TO authenticated
  USING (
    public.get_release_workspace_id(release_id) IN (
      SELECT public.get_user_workspace_ids(auth.uid())
    )
  );

-- INSERT: Назначать рецензентов могут владельцы (owner) и мейнтейнеры (maintainer) воркспейса
CREATE POLICY "rr_insert_policy"
  ON public.release_reviewers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_workspace_role(
      public.get_release_workspace_id(release_id), 
      auth.uid()
    ) IN ('owner', 'maintainer')
  );

-- UPDATE: Голосовать может сам рецензент, а менять список — owner и maintainer
CREATE POLICY "rr_update_policy"
  ON public.release_reviewers
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    public.get_user_workspace_role(
      public.get_release_workspace_id(release_id), 
      auth.uid()
    ) IN ('owner', 'maintainer')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    public.get_user_workspace_role(
      public.get_release_workspace_id(release_id), 
      auth.uid()
    ) IN ('owner', 'maintainer')
  );

-- DELETE: Удалять рецензентов могут owner и maintainer воркспейса
CREATE POLICY "rr_delete_policy"
  ON public.release_reviewers
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_workspace_role(
      public.get_release_workspace_id(release_id), 
      auth.uid()
    ) IN ('owner', 'maintainer')
  );

COMMIT;