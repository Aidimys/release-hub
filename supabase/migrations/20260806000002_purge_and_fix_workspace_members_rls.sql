BEGIN;

-- 1. Убеждаемся, что FORCE RLS отключен (чтобы SECURITY DEFINER функции владельца обходили RLS)
ALTER TABLE public.workspace_members NO FORCE ROW LEVEL SECURITY;

-- 2. Динамически удаляем ВСЕ существующие политики на workspace_members,
-- чтобы полностью очистить таблицу от любых старых рекурсивных правил
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'workspace_members'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.workspace_members', pol.policyname);
    END LOOP;
END $$;

-- 3. Создаем/обновляем SECURITY DEFINER функции для обхода RLS при проверке прав

-- Helper 1: Получение всех workspace_id пользователя
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(p_user_id uuid DEFAULT auth.uid())
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

-- Helper 2: Получение роли пользователя в конкретном воркспейсе
CREATE OR REPLACE FUNCTION public.get_user_workspace_role(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT role::text
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
  LIMIT 1;
$$;

-- Настройка прав выполнения
REVOKE EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_workspace_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_role(uuid, uuid) TO authenticated;

-- 4. Создаем чистый, полный набор нерекурсивных политик для workspace_members

-- SELECT: Пользователь видит себя и участников своих воркспейсов
CREATE POLICY "wm_select_policy"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

-- INSERT: Добавлять участников могут владельцы (owner) и мейнтейнеры (maintainer)
CREATE POLICY "wm_insert_policy"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_workspace_role(workspace_id, auth.uid()) IN ('owner', 'maintainer')
  );

-- UPDATE: Изменять роли участников может только owner
CREATE POLICY "wm_update_policy"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_workspace_role(workspace_id, auth.uid()) = 'owner'
  )
  WITH CHECK (
    public.get_user_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

-- DELETE: Исключать участников может owner, либо пользователь может выйти сам
CREATE POLICY "wm_delete_policy"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    public.get_user_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

COMMIT;