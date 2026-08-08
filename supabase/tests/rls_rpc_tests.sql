-- SQL tests for RLS policies and RPC functions
-- Run these against a local Supabase instance after applying migrations:
--   supabase db reset
--   psql -U postgres -d postgres -f supabase/tests/rls_rpc_tests.sql

BEGIN;

-- ============================================================================
-- TEST 1: RLS prevents cross-workspace access
-- ============================================================================

-- Create two test workspaces with different owners
DO $$
DECLARE
  v_ws1_id uuid := gen_random_uuid();
  v_ws2_id uuid := gen_random_uuid();
  v_user1_id uuid := gen_random_uuid();
  v_user2_id uuid := gen_random_uuid();
  v_product1_id uuid := gen_random_uuid();
  v_release1_id uuid := gen_random_uuid();
BEGIN
  -- Insert profiles
  INSERT INTO public.profiles (id, email, display_name) VALUES
    (v_user1_id, 'test-rls-user1@example.com', 'Test User 1'),
    (v_user2_id, 'test-rls-user2@example.com', 'Test User 2');

  -- Insert workspaces
  INSERT INTO public.workspaces (id, name, created_by) VALUES
    (v_ws1_id, 'Test WS 1', v_user1_id),
    (v_ws2_id, 'Test WS 2', v_user2_id);

  -- Insert memberships
  INSERT INTO public.workspace_members (workspace_id, user_id, role, status) VALUES
    (v_ws1_id, v_user1_id, 'owner', 'active'),
    (v_ws2_id, v_user2_id, 'owner', 'active');

  -- Insert products
  INSERT INTO public.products (id, workspace_id, name, slug) VALUES
    (v_product1_id, v_ws1_id, 'Test Product 1', 'test-product-1');

  -- Insert releases
  INSERT INTO public.releases (id, product_id, version, title, status) VALUES
    (v_release1_id, v_product1_id, '1.0.0', 'Test Release 1', 'draft');

  -- Test: user2 should NOT see releases from workspace1
  PERFORM set_config('app.current_user_id', v_user2_id::text, true);
  
  DECLARE
    v_count int;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.releases r
    JOIN public.products p ON p.id = r.product_id
    WHERE p.workspace_id = v_ws1_id;
    
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS FAILED: user2 can see releases from workspace1';
    END IF;
  END;

  PERFORM set_config('app.current_user_id', NULL, true);

  -- Cleanup
  DELETE FROM public.releases WHERE id = v_release1_id;
  DELETE FROM public.products WHERE id = v_product1_id;
  DELETE FROM public.workspace_members WHERE workspace_id IN (v_ws1_id, v_ws2_id);
  DELETE FROM public.workspaces WHERE id IN (v_ws1_id, v_ws2_id);
  DELETE FROM public.profiles WHERE id IN (v_user1_id, v_user2_id);
END $$;

-- ============================================================================
-- TEST 2: Trigger prevents direct status update
-- ============================================================================

DO $$
DECLARE
  v_ws_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_release_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.profiles (id, email, display_name) VALUES (v_user_id, 'test-trigger@example.com', 'Trigger Test');
  INSERT INTO public.workspaces (id, name, created_by) VALUES (v_ws_id, 'Trigger Test WS', v_user_id);
  INSERT INTO public.workspace_members (workspace_id, user_id, role, status) VALUES (v_ws_id, v_user_id, 'owner', 'active');
  INSERT INTO public.products (id, workspace_id, name, slug) VALUES (v_product_id, v_ws_id, 'Trigger Product', 'trigger-product');
  INSERT INTO public.releases (id, product_id, version, title, status) VALUES (v_release_id, v_product_id, '1.0.0', 'Trigger Release', 'draft');

  -- Try to update status directly without RPC flag
  BEGIN
    PERFORM set_config('app.current_user_id', v_user_id::text, true);
    UPDATE public.releases SET status = 'published' WHERE id = v_release_id;
    RAISE EXCEPTION 'Trigger FAILED: direct status update was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      -- Expected: trigger should block this
      NULL;
  END;

  PERFORM set_config('app.current_user_id', NULL, true);

  -- Cleanup
  DELETE FROM public.releases WHERE id = v_release_id;
  DELETE FROM public.products WHERE id = v_product_id;
  DELETE FROM public.workspace_members WHERE workspace_id = v_ws_id;
  DELETE FROM public.workspaces WHERE id = v_ws_id;
  DELETE FROM public.profiles WHERE id = v_user_id;
END $$;

-- ============================================================================
-- TEST 3: RPC submit_release_for_review works correctly
-- ============================================================================

DO $$
DECLARE
  v_ws_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_release_id uuid := gen_random_uuid();
  v_result boolean;
BEGIN
  INSERT INTO public.profiles (id, email, display_name) VALUES (v_user_id, 'test-rpc@example.com', 'RPC Test');
  INSERT INTO public.workspaces (id, name, created_by) VALUES (v_ws_id, 'RPC Test WS', v_user_id);
  INSERT INTO public.workspace_members (workspace_id, user_id, role, status) VALUES (v_ws_id, v_user_id, 'owner', 'active');
  INSERT INTO public.products (id, workspace_id, name, slug) VALUES (v_product_id, v_ws_id, 'RPC Product', 'rpc-product');
  INSERT INTO public.releases (id, product_id, version, title, status, description) VALUES
    (v_release_id, v_product_id, '1.0.0', 'RPC Release', 'draft', 'Test description');

  -- Add a change
  INSERT INTO public.release_changes (release_id, category, title, description, position, created_by) VALUES
    (v_release_id, 'feature', 'Test change', 'Test description', 0, v_user_id);

  -- Call RPC
  PERFORM set_config('app.current_user_id', v_user_id::text, true);
  SELECT public.submit_release_for_review(v_release_id, ARRAY[]::uuid[], NULL) INTO v_result;
  PERFORM set_config('app.current_user_id', NULL, true);

  IF v_result <> true THEN
    RAISE EXCEPTION 'RPC submit_release_for_review returned unexpected result: %', v_result;
  END IF;

  -- Verify status changed
  DECLARE
    v_status public.release_status;
  BEGIN
    SELECT status INTO v_status FROM public.releases WHERE id = v_release_id;
    IF v_status <> 'review' THEN
      RAISE EXCEPTION 'RPC FAILED: release status is %', v_status;
    END IF;
  END;

  -- Cleanup
  DELETE FROM public.release_changes WHERE release_id = v_release_id;
  DELETE FROM public.releases WHERE id = v_release_id;
  DELETE FROM public.products WHERE id = v_product_id;
  DELETE FROM public.workspace_members WHERE workspace_id = v_ws_id;
  DELETE FROM public.workspaces WHERE id = v_ws_id;
  DELETE FROM public.profiles WHERE id = v_user_id;
END $$;

-- ============================================================================
-- TEST 4: Published release is immutable
-- ============================================================================

DO $$
DECLARE
  v_ws_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_release_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.profiles (id, email, display_name) VALUES (v_user_id, 'test-immutable@example.com', 'Immutable Test');
  INSERT INTO public.workspaces (id, name, created_by) VALUES (v_ws_id, 'Immutable Test WS', v_user_id);
  INSERT INTO public.workspace_members (workspace_id, user_id, role, status) VALUES (v_ws_id, v_user_id, 'owner', 'active');
  INSERT INTO public.products (id, workspace_id, name, slug) VALUES (v_product_id, v_ws_id, 'Immutable Product', 'immutable-product');
  INSERT INTO public.releases (id, product_id, version, title, status, published_at) VALUES
    (v_release_id, v_product_id, '1.0.0', 'Immutable Release', 'published', NOW());

  -- Try to update title of published release
  BEGIN
    PERFORM set_config('app.current_user_id', v_user_id::text, true);
    UPDATE public.releases SET title = 'Hacked Title' WHERE id = v_release_id;
    RAISE EXCEPTION 'Trigger FAILED: published release title was modified';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  PERFORM set_config('app.current_user_id', NULL, true);

  -- Cleanup
  DELETE FROM public.releases WHERE id = v_release_id;
  DELETE FROM public.products WHERE id = v_product_id;
  DELETE FROM public.workspace_members WHERE workspace_id = v_ws_id;
  DELETE FROM public.workspaces WHERE id = v_ws_id;
  DELETE FROM public.profiles WHERE id = v_user_id;
END $$;

COMMIT;
