-- 1. Helper-функция с SECURITY DEFINER (обходит RLS и предотвращает рекурсию)
CREATE OR REPLACE FUNCTION is_workspace_member(w_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = w_id AND user_id = u_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Удаляем старые рекурсивные политики
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON workspaces;
DROP POLICY IF EXISTS "Members can view other members in same workspace" ON workspace_members;

-- 3. Создаем исправленные политики RLS с использованием helper-функции
CREATE POLICY "Users can view workspaces they are members of"
  ON workspaces FOR SELECT TO authenticated
  USING (
    is_workspace_member(id, auth.uid())
  );

CREATE POLICY "Members can view other members in same workspace"
  ON workspace_members FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id, auth.uid())
  );

-- 4. Пересоздаем RPC-функцию с явными именами параметров
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

  INSERT INTO workspaces (name, created_by)
  VALUES (workspace_name, current_user_id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, current_user_id, 'owner');

  INSERT INTO products (workspace_id, name, slug)
  VALUES (new_workspace_id, default_product_name, lower(replace(default_product_name, ' ', '-')))
  RETURNING id INTO new_product_id;

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