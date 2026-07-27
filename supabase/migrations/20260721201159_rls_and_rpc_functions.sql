-- ========================================================
-- 1. ХЕЛПЕРЫ ДЛЯ ПРОВЕРКИ ДОСТУПА И РОЛЕЙ (SECURITY DEFINER)
-- ========================================================

-- Проверка, состоит ли пользователь в воркспейсе (предотвращает рекурсию в RLS)
CREATE OR REPLACE FUNCTION is_workspace_member(w_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = w_id AND user_id = u_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Получение роли пользователя в конкретном воркспейсе
CREATE OR REPLACE FUNCTION get_workspace_role(w_id UUID, u_id UUID)
RETURNS workspace_role AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = w_id AND user_id = u_id;
$$ LANGUAGE sql SECURITY DEFINER;


-- ========================================================
-- 2. RLS ПОЛИТИКИ (ROW LEVEL SECURITY)
-- ========================================================

-- Profiles: авторизованные пользователи могут читать профили
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT TO authenticated USING (true);

-- Workspaces: доступ только участникам
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON workspaces;
CREATE POLICY "Users can view workspaces they are members of"
  ON workspaces FOR SELECT TO authenticated
  USING (
    is_workspace_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "Owners can update workspaces they own" ON workspaces;
CREATE POLICY "Owners can update workspaces they own"
  ON workspaces FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Owners can delete workspaces they own" ON workspaces;
CREATE POLICY "Owners can delete workspaces they own"
  ON workspaces FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- Workspace Members: просмотр участников внутри своего воркспейса
DROP POLICY IF EXISTS "Members can view other members in same workspace" ON workspace_members;
CREATE POLICY "Members can view other members in same workspace"
  ON workspace_members FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id, auth.uid())
  );


-- ========================================================
-- 3. АТОМАРНЫЕ RPC ФУНКЦИИ
-- ========================================================

-- Атомарное создание воркспейса с дефолтным продуктом и овнером
CREATE OR REPLACE FUNCTION create_workspace_with_defaults(
  workspace_name TEXT,
  default_product_name TEXT DEFAULT 'Main Product'
)
RETURNS UUID AS $$
DECLARE
  new_workspace_id UUID;
  new_product_id UUID;
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Создаем воркспейс
  INSERT INTO workspaces (name, created_by)
  VALUES (workspace_name, current_user_id)
  RETURNING id INTO new_workspace_id;

  -- 2. Назначаем создателя Owner'ом
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, current_user_id, 'owner');

  -- 3. Создаем продукт по умолчанию
  INSERT INTO products (workspace_id, name, slug)
  VALUES (new_workspace_id, default_product_name, lower(replace(default_product_name, ' ', '-')))
  RETURNING id INTO new_product_id;

  -- 4. Логируем в журнал активности
  INSERT INTO activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    new_workspace_id,
    current_user_id,
    'workspace_created',
    jsonb_build_object('workspace_name', workspace_name, 'product_id', new_product_id)
  );

  RETURN new_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';