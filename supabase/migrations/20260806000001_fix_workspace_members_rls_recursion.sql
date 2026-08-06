-- Migration: Fix Infinite Recursion in workspace_members RLS Policy
-- Description: Uses a SECURITY DEFINER helper function to break self-referential RLS recursion.

BEGIN;

-- 1. Создаем SECURITY DEFINER функцию для получения ID воркспейсов пользователя в обход RLS
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = p_user_id;
$$;

-- Настройка прав доступа к функции
REVOKE EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) TO authenticated;

-- 2. Удаляем рекурсивную политику
DROP POLICY IF EXISTS "Members can view other members in same workspace" ON public.workspace_members;

-- 3. Создаем исправленную политику без бесконечной рекурсии
CREATE POLICY "Members can view other members in same workspace" ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    workspace_id IN (
      SELECT public.get_user_workspace_ids(auth.uid())
    )
  );

COMMIT;

-- 1. Создаем SECURITY DEFINER функцию для проверки прав владельца без вызова RLS
CREATE OR REPLACE FUNCTION public.is_workspace_owner(
  p_workspace_id uuid, 
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND role = 'owner'
  );
$$;

-- Настройка прав доступа к функции
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) TO authenticated;

-- 2. Удаляем старую рекурсивную политику
DROP POLICY IF EXISTS "Owners can manage workspace members" ON public.workspace_members;

-- 3. Создаем исправленную политику с использованием helper-функции
CREATE POLICY "Owners can manage workspace members"
  ON public.workspace_members
  FOR ALL
  TO authenticated
  USING (
    public.is_workspace_owner(workspace_id, auth.uid())
  )
  WITH CHECK (
    public.is_workspace_owner(workspace_id, auth.uid())
  );