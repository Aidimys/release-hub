-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE TYPE public.change_category AS ENUM (
  'feature',
  'improvement',
  'bugfix',
  'security',
  'breaking'
);

CREATE TYPE public.release_status AS ENUM (
  'draft',
  'review',
  'approved',
  'rejected',
  'published'
);

CREATE TYPE public.workspace_role AS ENUM (
  'owner',
  'maintainer',
  'contributor'
);

CREATE FUNCTION public.cancel_published_release (
  p_release_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_role workspace_role;
  v_release_exists BOOLEAN;
BEGIN
  -- 1. Проверка аутентификации
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Получение роли пользователя за 1 запрос
  SELECT wm.role INTO v_user_role
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
  WHERE r.id = p_release_id
    AND wm.user_id = v_user_id;

  -- 3. Проверка существования релиза/доступа
  IF v_user_role IS NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.releases WHERE id = p_release_id) INTO v_release_exists;
    
    IF NOT v_release_exists THEN
      RAISE EXCEPTION 'Release not found';
    ELSE
      RAISE EXCEPTION 'You are not a member of this workspace';
    END IF;
  END IF;

  -- 4. Проверка прав (только owner)
  IF v_user_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can cancel published releases';
  END IF;

  -- 5. Возврат релиза в статус черновика
  UPDATE public.releases
  SET 
    status = 'draft',
    published_at = NULL,
    updated_at = NOW()
  WHERE id = p_release_id
    AND status = 'published';

  RETURN FOUND;
END;
$function$;

GRANT ALL ON FUNCTION public.cancel_published_release(uuid) TO anon;

GRANT ALL ON FUNCTION public.cancel_published_release(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_published_release(uuid) TO service_role;

CREATE FUNCTION public.change_member_role (
  p_workspace_id   uuid,
  p_target_user_id uuid,
  p_new_role       public.workspace_role
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_caller_role workspace_role;
BEGIN
  -- 1. Проверка авторизации
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Получаем роль вызывающего пользователя
  SELECT wm.role INTO v_caller_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = v_current_user_id
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  -- 3. Проверка прав (LOWER исключает проблемы с регистром ENUM)
  IF LOWER(v_caller_role::text) <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can change member roles';
  END IF;

  IF LOWER(p_new_role::text) = 'owner' THEN
    RAISE EXCEPTION 'Cannot assign owner role directly';
  END IF;

  -- 4. Обновление роли участника
  UPDATE public.workspace_members
  SET role = p_new_role
  WHERE workspace_id = p_workspace_id
    AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  RETURN 'Member role updated';
END;
$function$;

GRANT ALL ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) TO anon;

GRANT ALL ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) TO authenticated;

GRANT ALL ON FUNCTION public.change_member_role(uuid, uuid, public.workspace_role) TO service_role;

CREATE FUNCTION public.create_workspace_with_defaults (
  workspace_name       text,
  default_product_name text DEFAULT 'Main Product'::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.create_workspace_with_defaults(text, text) TO anon;

GRANT ALL ON FUNCTION public.create_workspace_with_defaults(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.create_workspace_with_defaults(text, text) TO service_role;

CREATE FUNCTION public.delete_workspace_by_id (
  workspace_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.delete_workspace_by_id(uuid) TO anon;

GRANT ALL ON FUNCTION public.delete_workspace_by_id(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_workspace_by_id(uuid) TO service_role;

CREATE FUNCTION public.delete_workspace (
  workspace_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  current_role workspace_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO current_role
  FROM public.workspace_members
  WHERE workspace_id = delete_workspace.workspace_id
    AND user_id = current_user_id;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF current_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can delete this workspace';
  END IF;

  DELETE FROM public.workspaces
  WHERE id = delete_workspace.workspace_id;
END;
$function$;

GRANT ALL ON FUNCTION public.delete_workspace(uuid) TO anon;

GRANT ALL ON FUNCTION public.delete_workspace(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_workspace(uuid) TO service_role;

CREATE FUNCTION public.find_profile_by_email (
  email_input text
)
  RETURNS TABLE (
    id uuid
  )
  LANGUAGE sql
  SECURITY DEFINER
  AS $function$
  SELECT p.id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(coalesce(u.email, '')) = lower(trim(email_input))
  LIMIT 1;
$function$;

GRANT ALL ON FUNCTION public.find_profile_by_email(text) TO anon;

GRANT ALL ON FUNCTION public.find_profile_by_email(text) TO authenticated;

GRANT ALL ON FUNCTION public.find_profile_by_email(text) TO service_role;

CREATE FUNCTION public.get_workspace_role (
  w_id uuid,
  u_id uuid
)
  RETURNS public.workspace_role
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = w_id AND user_id = u_id;
$function$;

GRANT ALL ON FUNCTION public.get_workspace_role(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.get_workspace_role(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_workspace_role(uuid, uuid) TO service_role;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            NEW.raw_user_meta_data->>'avatar_url');
    RETURN NEW;
END;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;

GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

CREATE FUNCTION public.invite_member (
  p_workspace_id uuid,
  p_email        text,
  p_role         public.workspace_role
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_role workspace_role;
  v_target_user_id UUID;
  v_existing_member_id UUID;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Получаем роль текущего пользователя
  SELECT wm.role INTO v_user_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = v_current_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  -- 2. Проверяем права приглашающего
  IF LOWER(v_user_role::text) <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can invite members (Ваша роль: %)', v_user_role;
  END IF;

  IF LOWER(p_role::text) = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite a user as owner';
  END IF;

  -- 3. Находим приглашаемого пользователя (исправлен p.id)
  SELECT p.id INTO v_target_user_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(coalesce(u.email, '')) = lower(trim(p_email));

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found by email';
  END IF;

  -- 4. Проверяем, не состоит ли он уже в воркспейсе (исправлен wm.id)
  SELECT wm.id INTO v_existing_member_id
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = v_target_user_id;

  IF v_existing_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'User is already a member of this workspace';
  END IF;

  -- 5. Добавляем участника
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_email, status)
  VALUES (p_workspace_id, v_target_user_id, p_role, trim(p_email), 'active');

  RETURN 'Invitation sent';
END;
$function$;

GRANT ALL ON FUNCTION public.invite_member(uuid, text, public.workspace_role) TO anon;

GRANT ALL ON FUNCTION public.invite_member(uuid, text, public.workspace_role) TO authenticated;

GRANT ALL ON FUNCTION public.invite_member(uuid, text, public.workspace_role) TO service_role;

CREATE FUNCTION public.is_workspace_member (
  w_id uuid,
  u_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = w_id AND user_id = u_id
  );
$function$;

GRANT ALL ON FUNCTION public.is_workspace_member(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role;

CREATE FUNCTION public.product_has_published_release (
  product_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.product_id = product_id
      AND r.status = 'published'
      AND r.published_at IS NOT NULL
  );
$function$;

GRANT ALL ON FUNCTION public.product_has_published_release(uuid) TO anon;

GRANT ALL ON FUNCTION public.product_has_published_release(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.product_has_published_release(uuid) TO service_role;

CREATE FUNCTION public.remove_member (
  p_workspace_id   uuid,
  p_target_user_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  current_role workspace_role;
  target_role workspace_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT wm.role INTO current_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = current_user_id;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF current_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can remove members';
  END IF;

  SELECT wm.role INTO target_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND user_id = p_target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove an owner';
  END IF;

  DELETE FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_target_user_id;

  RETURN 'Member removed';
END;
$function$;

GRANT ALL ON FUNCTION public.remove_member(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.remove_member(uuid, uuid) TO service_role;

CREATE FUNCTION public.rename_workspace (
  workspace_id uuid,
  new_name     text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.rename_workspace(uuid, text) TO anon;

GRANT ALL ON FUNCTION public.rename_workspace(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.rename_workspace(uuid, text) TO service_role;

CREATE FUNCTION public.update_member_role (
  p_workspace_id   uuid,
  p_target_user_id uuid,
  p_new_role       public.workspace_role
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_caller_role workspace_role;
BEGIN
  -- 1. Проверка авторизации
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (auth.uid() is NULL)';
  END IF;

  -- 2. Получаем роль вызывающего пользователя
  SELECT wm.role INTO v_caller_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = v_current_user_id
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Вы не состоите в этом воркспейсе (User: %, Workspace: %)', v_current_user_id, p_workspace_id;
  END IF;

  -- 3. Проверка прав
  IF LOWER(v_caller_role::text) <> 'owner' THEN
    RAISE EXCEPTION 'Только owner может менять роли (Ваша роль: %)', v_caller_role;
  END IF;

  IF LOWER(p_new_role::text) = 'owner' THEN
    RAISE EXCEPTION 'Cannot assign owner role directly';
  END IF;

  -- 4. Обновление
  UPDATE public.workspace_members
  SET role = p_new_role
  WHERE workspace_id = p_workspace_id
    AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Участник для обновления не найден (Target User: %, Workspace: %)', p_target_user_id, p_workspace_id;
  END IF;

  RETURN 'Member role updated';
END;
$function$;

GRANT ALL ON FUNCTION public.update_member_role(uuid, uuid, public.workspace_role) TO anon;

GRANT ALL ON FUNCTION public.update_member_role(uuid, uuid, public.workspace_role) TO authenticated;

GRANT ALL ON FUNCTION public.update_member_role(uuid, uuid, public.workspace_role) TO service_role;

CREATE FUNCTION public.update_workspace_name (
  workspace_id uuid,
  new_name     text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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

  SELECT role INTO current_role
  FROM public.workspace_members
  WHERE workspace_id = update_workspace_name.workspace_id
    AND user_id = current_user_id;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF current_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can rename this workspace';
  END IF;

  UPDATE public.workspaces
  SET name = trim(new_name)
  WHERE id = update_workspace_name.workspace_id;
END;
$function$;

GRANT ALL ON FUNCTION public.update_workspace_name(uuid, text) TO anon;

GRANT ALL ON FUNCTION public.update_workspace_name(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.update_workspace_name(uuid, text) TO service_role;

CREATE TABLE public.activity_events (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  release_id   uuid,
  actor_id     uuid                     NOT NULL,
  event_type   text                     NOT NULL,
  payload      jsonb                    DEFAULT '{}'::jsonb,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.activity_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_events
  REPLICA IDENTITY FULL;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);

GRANT ALL ON public.activity_events TO anon;

GRANT ALL ON public.activity_events TO authenticated;

GRANT ALL ON public.activity_events TO service_role;

CREATE POLICY "Authenticated users can create activity events" ON public.activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view activity events" ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.comments (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  release_id uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  content    text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comments
  REPLICA IDENTITY FULL;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

GRANT ALL ON public.comments TO anon;

GRANT ALL ON public.comments TO authenticated;

GRANT ALL ON public.comments TO service_role;

CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete comments" ON public.comments
  FOR DELETE
  TO authenticated
  USING (((auth.uid() = user_id) OR true));

CREATE POLICY "Authenticated users can view comments" ON public.comments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.products (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  name         text                     NOT NULL,
  slug         text                     NOT NULL,
  description  text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.products
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products
  REPLICA IDENTITY FULL;

ALTER TABLE public.products
  ADD CONSTRAINT products_pkey PRIMARY KEY (id);

GRANT ALL ON public.products TO anon;

GRANT ALL ON public.products TO authenticated;

GRANT ALL ON public.products TO service_role;

CREATE POLICY "Public can view products with published releases" ON public.products
  FOR SELECT
  USING (public.product_has_published_release(id));

CREATE TABLE public.profiles (
  id           uuid                     NOT NULL,
  display_name text,
  avatar_url   text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.release_changes (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  release_id  uuid                     NOT NULL,
  category    public.change_category   NOT NULL,
  title       text                     NOT NULL,
  description text                     NOT NULL,
  "position"  integer                  NOT NULL,
  created_by  uuid,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.release_changes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.release_changes
  REPLICA IDENTITY FULL;

ALTER TABLE public.release_changes
  ADD CONSTRAINT release_changes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.release_changes
  ADD CONSTRAINT release_changes_pkey PRIMARY KEY (id);

GRANT ALL ON public.release_changes TO anon;

GRANT ALL ON public.release_changes TO authenticated;

GRANT ALL ON public.release_changes TO service_role;

CREATE POLICY "Authenticated users can create release changes" ON public.release_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update release changes" ON public.release_changes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view release changes" ON public.release_changes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.release_reviewers (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  release_id uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  decision   text,
  decided_at timestamp with time zone
);

ALTER TABLE public.release_reviewers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.release_reviewers
  REPLICA IDENTITY FULL;

ALTER TABLE public.release_reviewers
  ADD CONSTRAINT release_reviewers_decision_check CHECK (decision = ANY (ARRAY['approved'::text, 'rejected'::text]));

ALTER TABLE public.release_reviewers
  ADD CONSTRAINT release_reviewers_pkey PRIMARY KEY (id);

ALTER TABLE public.release_reviewers
  ADD CONSTRAINT release_reviewers_release_id_user_id_key UNIQUE (release_id, user_id);

ALTER TABLE public.release_reviewers
  ADD CONSTRAINT release_reviewers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.release_reviewers TO anon;

GRANT ALL ON public.release_reviewers TO authenticated;

GRANT ALL ON public.release_reviewers TO service_role;

CREATE POLICY "Authenticated users can manage release reviewers" ON public.release_reviewers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update release reviewers" ON public.release_reviewers
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view release reviewers" ON public.release_reviewers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.releases (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  product_id   uuid                     NOT NULL,
  version      text                     NOT NULL,
  title        text                     NOT NULL,
  description  text,
  status       public.release_status    DEFAULT 'draft'::public.release_status NOT NULL,
  planned_at   timestamp with time zone,
  published_at timestamp with time zone,
  created_by   uuid,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "Public can view release changes for published releases" ON public.release_changes
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.releases r
  WHERE ((r.id = release_changes.release_id) AND (r.status = 'published'::public.release_status) AND (r.published_at IS NOT NULL)))));

ALTER TABLE public.releases
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.releases
  REPLICA IDENTITY FULL;

ALTER TABLE public.releases
  ADD CONSTRAINT releases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.releases
  ADD CONSTRAINT releases_pkey PRIMARY KEY (id);

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;

ALTER TABLE public.release_changes
  ADD CONSTRAINT release_changes_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;

ALTER TABLE public.release_reviewers
  ADD CONSTRAINT release_reviewers_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;

ALTER TABLE public.releases
  ADD CONSTRAINT releases_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT ALL ON public.releases TO anon;

GRANT ALL ON public.releases TO authenticated;

GRANT ALL ON public.releases TO service_role;

CREATE POLICY "Authenticated users can delete releases" ON public.releases
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update releases" ON public.releases
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can view published releases" ON public.releases
  FOR SELECT
  USING (((status = 'published'::public.release_status) AND (published_at IS NOT NULL)));

CREATE TABLE public.workspace_members (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id  uuid,
  user_id       uuid,
  role          public.workspace_role    DEFAULT 'contributor'::public.workspace_role NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  invited_email text,
  status        text                     DEFAULT 'active'::text NOT NULL
);

CREATE POLICY "Members can view activity events" ON public.activity_events
  FOR SELECT
  TO authenticated
  USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));

CREATE POLICY "Owners maintainers contributors can create activity events" ON public.activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE
    ((workspace_members.user_id = auth.uid()) AND (workspace_members.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role,
    'contributor'::public.workspace_role]))))));

CREATE POLICY "Contributors can delete own unpublished comments" ON public.comments
  FOR DELETE
  TO authenticated
  USING (((user_id = auth.uid()) AND (release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.releases r
  WHERE ((r.id = comments.release_id) AND (r.status <> 'published'::public.release_status))))));

CREATE POLICY "Members can view comments" ON public.comments
  FOR SELECT
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));

CREATE POLICY "Owners maintainers can update comments" ON public.comments
  FOR UPDATE
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))))
  WITH CHECK ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners maintainers contributors can create comments" ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role, 'contributor'::public.workspace_role]))))));

CREATE POLICY "Members can view products in same workspace" ON public.products
  FOR SELECT
  TO authenticated
  USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));

CREATE POLICY "Owners can delete products" ON public.products
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = products.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Owners can insert products" ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = products.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Owners can update products" ON public.products
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = products.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = products.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Contributors can delete own unpublished release changes" ON public.release_changes
  FOR DELETE
  TO authenticated
  USING (((created_by = auth.uid()) AND (release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.releases r
  WHERE ((r.id = release_changes.release_id) AND (r.status <> 'published'::public.release_status))))));

CREATE POLICY "Members can view release changes" ON public.release_changes
  FOR SELECT
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));

CREATE POLICY "Owners maintainers can update release changes" ON public.release_changes
  FOR UPDATE
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))))
  WITH CHECK ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners maintainers contributors can create release changes" ON public.release_changes
  FOR INSERT
  TO authenticated
  WITH CHECK ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role, 'contributor'::public.workspace_role]))))));

CREATE POLICY "Members can view release reviewers" ON public.release_reviewers
  FOR SELECT
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));

CREATE POLICY "Owners can delete release reviewers" ON public.release_reviewers
  FOR DELETE
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Owners can update release reviewers" ON public.release_reviewers
  FOR UPDATE
  TO authenticated
  USING ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))))
  WITH CHECK ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Owners maintainers can manage release reviewers" ON public.release_reviewers
  FOR INSERT
  TO authenticated
  WITH CHECK ((release_id IN ( SELECT r.id
   FROM ((public.releases r
     JOIN public.products p ON ((p.id = r.product_id)))
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Members can create releases for products in same workspace" ON public.releases
  FOR INSERT
  TO authenticated
  WITH CHECK ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));

CREATE POLICY "Members can view releases in same workspace" ON public.releases
  FOR SELECT
  TO authenticated
  USING ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));

CREATE POLICY "Members can view releases in their workspace" ON public.releases
  FOR SELECT
  TO authenticated
  USING ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));

CREATE POLICY "Owners and maintainers can create releases" ON public.releases
  FOR INSERT
  TO authenticated
  WITH CHECK ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners and maintainers can update releases" ON public.releases
  FOR UPDATE
  TO authenticated
  USING ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))))
  WITH CHECK ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners can delete releases" ON public.releases
  FOR DELETE
  TO authenticated
  USING ((product_id IN ( SELECT p.id
   FROM (public.products p
     JOIN public.workspace_members wm ON ((wm.workspace_id = p.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = 'owner'::public.workspace_role)))));

ALTER TABLE public.workspace_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id);

GRANT ALL ON public.workspace_members TO anon;

GRANT ALL ON public.workspace_members TO authenticated;

GRANT ALL ON public.workspace_members TO service_role;

CREATE POLICY "Members can view other members in same workspace" ON public.workspace_members
  FOR SELECT
  USING (true);

CREATE POLICY "Owner can delete workspace members" ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members m
  WHERE ((m.workspace_id = workspace_members.workspace_id) AND (m.user_id = auth.uid()) AND (m.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Owner can update workspace members" ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members m
  WHERE ((m.workspace_id = workspace_members.workspace_id) AND (m.user_id = auth.uid()) AND (m.role = 'owner'::public.workspace_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_members m
  WHERE ((m.workspace_id = workspace_members.workspace_id) AND (m.user_id = auth.uid()) AND (m.role = 'owner'::public.workspace_role)))));

CREATE POLICY "Owners and maintainers can delete workspace members" ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members manager_members
  WHERE
    ((manager_members.workspace_id = workspace_members.workspace_id) AND (manager_members.user_id = auth.uid()) AND (manager_members.role = ANY
    (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners and maintainers can insert workspace members" ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_members manager_members
  WHERE
    ((manager_members.workspace_id = workspace_members.workspace_id) AND (manager_members.user_id = auth.uid()) AND (manager_members.role = ANY
    (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners and maintainers can update workspace members" ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members manager_members
  WHERE
    ((manager_members.workspace_id = workspace_members.workspace_id) AND (manager_members.user_id = auth.uid()) AND (manager_members.role = ANY
    (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_members manager_members
  WHERE
    ((manager_members.workspace_id = workspace_members.workspace_id) AND (manager_members.user_id = auth.uid()) AND (manager_members.role = ANY
    (ARRAY['owner'::public.workspace_role, 'maintainer'::public.workspace_role]))))));

CREATE POLICY "Owners can insert workspace members" ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM public.workspace_members m
  WHERE ((m.workspace_id = workspace_members.workspace_id) AND (m.user_id = auth.uid()) AND (m.role = 'owner'::public.workspace_role)))) AND
    (role <> 'owner'::public.workspace_role) AND (user_id IS NOT NULL)));

CREATE TABLE public.workspaces (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name       text                     NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events,
  TABLE public.comments,
  TABLE public.products, TABLE public.release_changes, TABLE public.release_reviewers, TABLE public.releases, TABLE public.workspace_members, TABLE public.workspaces;

ALTER TABLE public.workspaces
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.products
  ADD CONSTRAINT products_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

GRANT ALL ON public.workspaces TO anon;

GRANT ALL ON public.workspaces TO authenticated;

GRANT ALL ON public.workspaces TO service_role;

CREATE POLICY "Users can view workspaces they are members of" ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));
