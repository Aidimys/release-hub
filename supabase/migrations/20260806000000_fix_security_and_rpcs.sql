-- ============================================================================
-- Migration: Complete Security Hardening, RLS Lockdown, Atomic Transitions & Immutability
-- Description: Fully covers RLS for all entities, restricts direct status/publication updates,
--              adds atomic status RPCs with optimistic locking, and enforces immutable release rules.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DROP ALL EXISTING DANGEROUS / PERMISSIVE RLS POLICIES
-- ============================================================================

-- Workspaces
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON public.workspaces;

-- Workspace Members
DROP POLICY IF EXISTS "Members can view other members in same workspace" ON public.workspace_members;
DROP POLICY IF EXISTS "Owner can delete workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owner can update workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners and maintainers can delete workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners and maintainers can insert workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners and maintainers can update workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners can insert workspace members" ON public.workspace_members;

-- Products
DROP POLICY IF EXISTS "Public can view products with published releases" ON public.products;
DROP POLICY IF EXISTS "Members can view products in same workspace" ON public.products;
DROP POLICY IF EXISTS "Owners can delete products" ON public.products;
DROP POLICY IF EXISTS "Owners can insert products" ON public.products;
DROP POLICY IF EXISTS "Owners can update products" ON public.products;

-- Releases
DROP POLICY IF EXISTS "Public can view published releases" ON public.releases;
DROP POLICY IF EXISTS "Members can create releases for products in same workspace" ON public.releases;
DROP POLICY IF EXISTS "Members can view releases in same workspace" ON public.releases;
DROP POLICY IF EXISTS "Members can view releases in their workspace" ON public.releases;
DROP POLICY IF EXISTS "Owners and maintainers can create releases" ON public.releases;
DROP POLICY IF EXISTS "Owners and maintainers can update releases" ON public.releases;
DROP POLICY IF EXISTS "Owners can delete releases" ON public.releases;
DROP POLICY IF EXISTS "Authenticated users can delete releases" ON public.releases;
DROP POLICY IF EXISTS "Authenticated users can update releases" ON public.releases;

-- Release Changes
DROP POLICY IF EXISTS "Public can view release changes for published releases" ON public.release_changes;
DROP POLICY IF EXISTS "Authenticated users can create release changes" ON public.release_changes;
DROP POLICY IF EXISTS "Authenticated users can update release changes" ON public.release_changes;
DROP POLICY IF EXISTS "Authenticated users can view release changes" ON public.release_changes;
DROP POLICY IF EXISTS "Contributors can delete own unpublished release changes" ON public.release_changes;
DROP POLICY IF EXISTS "Members can view release changes" ON public.release_changes;
DROP POLICY IF EXISTS "Owners maintainers can update release changes" ON public.release_changes;
DROP POLICY IF EXISTS "Owners maintainers contributors can create release changes" ON public.release_changes;

-- Release Reviewers
DROP POLICY IF EXISTS "Authenticated users can manage release reviewers" ON public.release_reviewers;
DROP POLICY IF EXISTS "Authenticated users can update release reviewers" ON public.release_reviewers;
DROP POLICY IF EXISTS "Authenticated users can view release reviewers" ON public.release_reviewers;
DROP POLICY IF EXISTS "Members can view release reviewers" ON public.release_reviewers;
DROP POLICY IF EXISTS "Owners can delete release reviewers" ON public.release_reviewers;
DROP POLICY IF EXISTS "Owners can update release reviewers" ON public.release_reviewers;
DROP POLICY IF EXISTS "Owners maintainers can manage release reviewers" ON public.release_reviewers;

-- Comments
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can delete comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
DROP POLICY IF EXISTS "Contributors can delete own unpublished comments" ON public.comments;
DROP POLICY IF EXISTS "Members can view comments" ON public.comments;
DROP POLICY IF EXISTS "Owners maintainers can update comments" ON public.comments;
DROP POLICY IF EXISTS "Owners maintainers contributors can create comments" ON public.comments;

-- Activity Events
DROP POLICY IF EXISTS "Authenticated users can create activity events" ON public.activity_events;
DROP POLICY IF EXISTS "Authenticated users can view activity events" ON public.activity_events;
DROP POLICY IF EXISTS "Members can view activity events" ON public.activity_events;
DROP POLICY IF EXISTS "Owners maintainers contributors can create activity events" ON public.activity_events;


-- ============================================================================
-- 2. RE-CREATE STRICT WORKSPACE-SCOPED RLS POLICIES FOR ALL TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- WORKSPACES
-- ----------------------------------------------------------------------------
CREATE POLICY "Members can view their workspaces" 
  ON public.workspaces
  FOR SELECT 
  TO authenticated
  USING (
    public.is_workspace_member(id, auth.uid())
  );

-- ----------------------------------------------------------------------------
-- WORKSPACE MEMBERS
-- ----------------------------------------------------------------------------
CREATE POLICY "Members can view members in same workspace" 
  ON public.workspace_members
  FOR SELECT 
  TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id 
      FROM public.workspace_members wm 
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage workspace members" 
  ON public.workspace_members
  FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- ----------------------------------------------------------------------------
-- PRODUCTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view products with published releases" 
  ON public.products
  FOR SELECT 
  TO anon, authenticated
  USING (
    public.product_has_published_release(id)
  );

CREATE POLICY "Members can view products in workspace" 
  ON public.products
  FOR SELECT 
  TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id 
      FROM public.workspace_members wm 
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and maintainers can manage products" 
  ON public.products
  FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.workspace_members wm
      WHERE wm.workspace_id = products.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'maintainer')
    )
  );

-- ----------------------------------------------------------------------------
-- RELEASES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view published releases" 
  ON public.releases
  FOR SELECT 
  TO anon, authenticated
  USING (
    status = 'published' AND published_at IS NOT NULL
  );

CREATE POLICY "Members can view releases in workspace" 
  ON public.releases
  FOR SELECT 
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id 
      FROM public.products p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and maintainers can insert releases" 
  ON public.releases
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    product_id IN (
      SELECT p.id 
      FROM public.products p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'maintainer')
    )
  );

-- Direct client updates CANNOT change status or published_at directly!
-- Status transitions MUST go through SECURITY DEFINER RPCs which set transaction flag.
CREATE POLICY "Owners and maintainers can update non-status release fields" 
  ON public.releases
  FOR UPDATE 
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id 
      FROM public.products p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'maintainer')
    )
  )
  WITH CHECK (
    product_id IN (
      SELECT p.id 
      FROM public.products p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'maintainer')
    )
  );

CREATE POLICY "Owners can delete releases" 
  ON public.releases
  FOR DELETE 
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id 
      FROM public.products p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND wm.role = 'owner'
    )
  );

-- ----------------------------------------------------------------------------
-- RELEASE CHANGES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view changes of published releases" 
  ON public.release_changes
  FOR SELECT 
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.releases r 
      WHERE r.id = release_changes.release_id 
        AND r.status = 'published' 
        AND r.published_at IS NOT NULL
    )
  );

CREATE POLICY "Members can view release changes" 
  ON public.release_changes
  FOR SELECT 
  TO authenticated
  USING (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert release changes if not published" 
  ON public.release_changes
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'maintainer', 'contributor')
        AND r.status <> 'published'
    )
  );

CREATE POLICY "Owners maintainers or author can update release changes if not published" 
  ON public.release_changes
  FOR UPDATE 
  TO authenticated
  USING (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND r.status <> 'published'
        AND (wm.role IN ('owner', 'maintainer') OR release_changes.created_by = auth.uid())
    )
  );

CREATE POLICY "Owners maintainers or author can delete release changes if not published" 
  ON public.release_changes
  FOR DELETE 
  TO authenticated
  USING (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND r.status <> 'published'
        AND (wm.role IN ('owner', 'maintainer') OR release_changes.created_by = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- RELEASE REVIEWERS
-- ----------------------------------------------------------------------------
CREATE POLICY "Members can view release reviewers" 
  ON public.release_reviewers
  FOR SELECT 
  TO authenticated
  USING (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- COMMENTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Members can view comments" 
  ON public.comments
  FOR SELECT 
  TO authenticated
  USING (
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create comments" 
  ON public.comments
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    release_id IN (
      SELECT r.id 
      FROM public.releases r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'maintainer', 'contributor')
    )
  );

CREATE POLICY "Authors and managers can delete comments" 
  ON public.comments
  FOR DELETE 
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

-- ----------------------------------------------------------------------------
-- ACTIVITY EVENTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Members can view activity events" 
  ON public.activity_events
  FOR SELECT 
  TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id 
      FROM public.workspace_members wm 
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create activity events" 
  ON public.activity_events
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid() AND
    workspace_id IN (
      SELECT wm.workspace_id 
      FROM public.workspace_members wm 
      WHERE wm.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 3. FINE-GRAINED IMMUTABILITY TRIGGERS & CONSTRAINTS
-- ============================================================================

-- Ensure unique change positions per release
ALTER TABLE public.release_changes 
  DROP CONSTRAINT IF EXISTS release_changes_release_id_position_key;

ALTER TABLE public.release_changes 
  ADD CONSTRAINT release_changes_release_id_position_key UNIQUE (release_id, position);

-- ----------------------------------------------------------------------------
-- Trigger Function: Prevent changing core release fields once published
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_release_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent direct modification of status and published_at unless session flag is set by an authorized RPC
  IF (OLD.status IS DISTINCT FROM NEW.status OR OLD.published_at IS DISTINCT FROM NEW.published_at) THEN
    IF current_setting('app.allow_status_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Status and published_at cannot be updated directly. Use dedicated RPC functions.';
    END IF;
  END IF;

  IF OLD.status = 'published' AND NEW.status = 'published' THEN
    IF OLD.title IS DISTINCT FROM NEW.title OR
       OLD.version IS DISTINCT FROM NEW.version OR
       OLD.description IS DISTINCT FROM NEW.description OR
       OLD.product_id IS DISTINCT FROM NEW.product_id OR
       OLD.published_at IS DISTINCT FROM NEW.published_at THEN
      RAISE EXCEPTION 'Core fields of a published release cannot be modified';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp';

DROP TRIGGER IF EXISTS trg_prevent_published_release_update ON public.releases;

CREATE TRIGGER trg_prevent_published_release_update
  BEFORE UPDATE ON public.releases
  FOR EACH ROW
  EXECUTE FUNCTION public.check_release_immutability();

-- ----------------------------------------------------------------------------
-- Trigger Function: Prevent mutating release_changes on published releases
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_release_changes_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_rel_id uuid;
  v_status release_status;
BEGIN
  v_rel_id := COALESCE(NEW.release_id, OLD.release_id);
  
  SELECT status INTO v_status 
  FROM public.releases 
  WHERE id = v_rel_id;
  
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'Cannot insert, update or delete changes for a published release';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp';

DROP TRIGGER IF EXISTS trg_prevent_published_release_changes_mutation ON public.release_changes;

CREATE TRIGGER trg_prevent_published_release_changes_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.release_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_release_changes_immutability();


-- ============================================================================
-- 4. ATOMIC RPCs FOR STATUS TRANSITIONS WITH FULL VALIDATION & OPTIMISTIC LOCKING
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1. SUBMIT RELEASE FOR REVIEW
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_release_for_review(
  p_release_id uuid,
  p_reviewer_ids uuid[],
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role workspace_role;
  v_workspace_id uuid;
  v_status release_status;
  v_updated_at timestamptz;
  v_title text;
  v_version text;
  v_reviewer_id uuid;
  v_changes_count int;
  v_valid_reviewers_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Lock release row & get context
  SELECT 
    r.status, r.updated_at, r.title, r.version, p.workspace_id, wm.role
  INTO 
    v_status, v_updated_at, v_title, v_version, v_workspace_id, v_role
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = v_user_id
  WHERE r.id = p_release_id
  FOR UPDATE OF r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Release not found or access denied';
  END IF;

  IF v_role NOT IN ('owner', 'maintainer') THEN
    RAISE EXCEPTION 'Only owners and maintainers can submit releases for review';
  END IF;

  -- 2. Optimistic locking check
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Release has been modified by another user. Please refresh.';
  END IF;

  -- 3. Check current status
  IF v_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Release must be in draft or rejected status to submit for review';
  END IF;

  -- 4. Check Title and Version
  IF v_title IS NULL OR trim(v_title) = '' THEN
    RAISE EXCEPTION 'Release title cannot be empty';
  END IF;

  IF v_version IS NULL OR trim(v_version) = '' THEN
    RAISE EXCEPTION 'Release version cannot be empty';
  END IF;

  -- 5. Check Changes requirements
  SELECT COUNT(*) INTO v_changes_count 
  FROM public.release_changes 
  WHERE release_id = p_release_id;

  IF v_changes_count = 0 THEN
    RAISE EXCEPTION 'Release must contain at least one change before submission';
  END IF;

  IF EXISTS (
    SELECT 1 
    FROM public.release_changes
    WHERE release_id = p_release_id
      AND (
        title IS NULL OR trim(title) = '' OR 
        description IS NULL OR trim(description) = '' OR 
        category IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'All changes must have a non-empty title, description, and category';
  END IF;

  -- 6. Check Reviewers count
  IF p_reviewer_ids IS NULL OR array_length(p_reviewer_ids, 1) IS NULL OR array_length(p_reviewer_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one reviewer is required';
  END IF;

  -- 7. Check Reviewers membership in workspace
  SELECT COUNT(DISTINCT user_id) INTO v_valid_reviewers_count
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id 
    AND user_id = ANY(p_reviewer_ids);

  IF v_valid_reviewers_count <> array_length(p_reviewer_ids, 1) THEN
    RAISE EXCEPTION 'One or more assigned reviewers do not belong to this workspace';
  END IF;

  -- 8. Assign reviewers & update release
  DELETE FROM public.release_reviewers 
  WHERE release_id = p_release_id;

  FOREACH v_reviewer_id IN ARRAY p_reviewer_ids LOOP
    INSERT INTO public.release_reviewers (release_id, user_id)
    VALUES (p_release_id, v_reviewer_id);
  END LOOP;

  PERFORM set_config('app.allow_status_change', 'true', true);

  UPDATE public.releases
  SET status = 'review', 
      updated_at = NOW()
  WHERE id = p_release_id;

  INSERT INTO public.activity_events (workspace_id, release_id, actor_id, event_type, payload)
  VALUES (
    v_workspace_id,
    p_release_id,
    v_user_id,
    'release_submitted_for_review',
    jsonb_build_object('reviewer_ids', p_reviewer_ids)
  );

  RETURN TRUE;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4.2. CAST RELEASE VOTE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_release_vote(
  p_release_id uuid,
  p_decision text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_status release_status;
  v_updated_at timestamptz;
  v_total_reviewers int;
  v_approved_count int;
  v_rejected_count int;
  v_new_status release_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision value. Must be approved or rejected';
  END IF;

  -- 1. Lock release row
  SELECT r.status, r.updated_at, p.workspace_id
  INTO v_status, v_updated_at, v_workspace_id
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = v_user_id
  WHERE r.id = p_release_id
  FOR UPDATE OF r;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Release not found or access denied';
  END IF;

  -- 2. Optimistic locking check
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Release has been modified by another user. Please refresh.';
  END IF;

  IF v_status <> 'review' THEN
    RAISE EXCEPTION 'Release is not currently under review';
  END IF;

  -- 3. Check reviewer assignment AND active workspace membership
  IF NOT EXISTS (
    SELECT 1 
    FROM public.release_reviewers rr
    JOIN public.workspace_members wm ON wm.workspace_id = v_workspace_id AND wm.user_id = rr.user_id
    WHERE rr.release_id = p_release_id AND rr.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not assigned as a reviewer for this release in this workspace';
  END IF;

  -- 4. Record decision
  UPDATE public.release_reviewers
  SET decision = p_decision, 
      decided_at = NOW()
  WHERE release_id = p_release_id AND user_id = v_user_id;

  -- 5. Calculate results
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE decision = 'approved'),
    COUNT(*) FILTER (WHERE decision = 'rejected')
  INTO 
    v_total_reviewers, v_approved_count, v_rejected_count
  FROM public.release_reviewers
  WHERE release_id = p_release_id;

  v_new_status := 'review';

  IF v_rejected_count > 0 THEN
    v_new_status := 'rejected';
  ELSIF v_approved_count = v_total_reviewers THEN
    v_new_status := 'approved';
  END IF;

  -- 6. Update release status
  PERFORM set_config('app.allow_status_change', 'true', true);

  IF v_new_status <> 'review' THEN
    UPDATE public.releases
    SET status = v_new_status, 
        updated_at = NOW()
    WHERE id = p_release_id;
  ELSE
    UPDATE public.releases
    SET updated_at = NOW()
    WHERE id = p_release_id;
  END IF;

  INSERT INTO public.activity_events (workspace_id, release_id, actor_id, event_type, payload)
  VALUES (
    v_workspace_id,
    p_release_id,
    v_user_id,
    'vote_cast',
    jsonb_build_object('decision', p_decision, 'resulting_status', v_new_status)
  );

  RETURN v_new_status::text;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4.3. PUBLISH RELEASE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_release(
  p_release_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role workspace_role;
  v_workspace_id uuid;
  v_status release_status;
  v_updated_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.status, r.updated_at, p.workspace_id, wm.role
  INTO v_status, v_updated_at, v_workspace_id, v_role
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = v_user_id
  WHERE r.id = p_release_id
  FOR UPDATE OF r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Release not found or access denied';
  END IF;

  IF v_role NOT IN ('owner', 'maintainer') THEN
    RAISE EXCEPTION 'Only owners and maintainers can publish releases';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Release has been modified by another user. Please refresh.';
  END IF;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved releases can be published';
  END IF;

  PERFORM set_config('app.allow_status_change', 'true', true);

  UPDATE public.releases
  SET status = 'published',
      published_at = NOW(),
      updated_at = NOW()
  WHERE id = p_release_id;

  INSERT INTO public.activity_events (workspace_id, release_id, actor_id, event_type, payload)
  VALUES (
    v_workspace_id,
    p_release_id,
    v_user_id,
    'release_published',
    jsonb_build_object('published_at', NOW())
  );

  RETURN TRUE;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4.4. RETURN REJECTED RELEASE TO DRAFT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_rejected_release_to_draft(
  p_release_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role workspace_role;
  v_workspace_id uuid;
  v_status release_status;
  v_updated_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.status, r.updated_at, p.workspace_id, wm.role
  INTO v_status, v_updated_at, v_workspace_id, v_role
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = v_user_id
  WHERE r.id = p_release_id
  FOR UPDATE OF r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Release not found or access denied';
  END IF;

  IF v_role NOT IN ('owner', 'maintainer') THEN
    RAISE EXCEPTION 'Only owners and maintainers can return rejected releases to draft';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Release has been modified by another user. Please refresh.';
  END IF;

  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'Only rejected releases can be returned to draft';
  END IF;

  PERFORM set_config('app.allow_status_change', 'true', true);

  UPDATE public.releases
  SET status = 'draft', 
      updated_at = NOW()
  WHERE id = p_release_id;

  INSERT INTO public.activity_events (workspace_id, release_id, actor_id, event_type, payload)
  VALUES (
    v_workspace_id,
    p_release_id,
    v_user_id,
    'release_returned_to_draft',
    jsonb_build_object()
  );

  RETURN TRUE;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4.5. CANCEL PUBLISHED RELEASE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_published_release(
  p_release_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role workspace_role;
  v_workspace_id uuid;
  v_status release_status;
  v_updated_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.status, r.updated_at, p.workspace_id, wm.role
  INTO v_status, v_updated_at, v_workspace_id, v_role
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = v_user_id
  WHERE r.id = p_release_id
  FOR UPDATE OF r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Release not found or access denied';
  END IF;

  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can cancel published releases';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Release has been modified by another user. Please refresh.';
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Only published releases can be cancelled';
  END IF;

  PERFORM set_config('app.allow_status_change', 'true', true);

  UPDATE public.releases
  SET status = 'draft',
      published_at = NULL,
      updated_at = NOW()
  WHERE id = p_release_id;

  INSERT INTO public.activity_events (workspace_id, release_id, actor_id, event_type, payload)
  VALUES (
    v_workspace_id,
    p_release_id,
    v_user_id,
    'release_publication_cancelled',
    jsonb_build_object()
  );

  RETURN TRUE;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4.6. ATOMIC REORDER WITH COMPLETE ITEM VERIFICATION, DUP CHECK & ACTIVITY LOG
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_release_changes(
  p_release_id uuid,
  p_items jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role workspace_role;
  v_workspace_id uuid;
  v_current_updated_at timestamptz;
  v_status release_status;
  v_db_changes_count int;
  v_json_items_count int;
  v_unique_positions_count int;
  item jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Lock release row
  SELECT r.status, r.updated_at, p.workspace_id, wm.role
  INTO v_status, v_current_updated_at, v_workspace_id, v_role
  FROM public.releases r
  JOIN public.products p ON p.id = r.product_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = v_user_id
  WHERE r.id = p_release_id
  FOR UPDATE OF r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Release not found or access denied';
  END IF;

  IF v_status = 'published' THEN
    RAISE EXCEPTION 'Cannot reorder changes in a published release';
  END IF;

  -- 2. Optimistic locking check
  IF p_expected_updated_at IS NOT NULL AND v_current_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Release has been modified by another user. Please refresh.';
  END IF;

  -- 3. Verify that payload contains ALL changes belonging to this release
  SELECT COUNT(*) INTO v_db_changes_count 
  FROM public.release_changes 
  WHERE release_id = p_release_id;

  v_json_items_count := jsonb_array_length(p_items);

  IF v_db_changes_count <> v_json_items_count THEN
    RAISE EXCEPTION 'Reorder array must contain all % changes belonging to this release', v_db_changes_count;
  END IF;

  -- 4. Check for duplicate positions in payload
  SELECT COUNT(DISTINCT (x->>'position')::int) INTO v_unique_positions_count
  FROM jsonb_array_elements(p_items) AS x;

  IF v_unique_positions_count <> v_json_items_count THEN
    RAISE EXCEPTION 'Duplicate positions detected in reorder payload';
  END IF;

  -- 5. Avoid unique constraint collisions during batch update
  UPDATE public.release_changes
  SET position = -1 * position - 1000
  WHERE release_id = p_release_id;

  -- 6. Update new positions
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.release_changes
    SET position = (item->>'position')::int,
        updated_at = NOW()
    WHERE id = (item->>'id')::uuid AND release_id = p_release_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Change item % does not belong to release %', item->>'id', p_release_id;
    END IF;
  END LOOP;

  UPDATE public.releases
  SET updated_at = NOW()
  WHERE id = p_release_id;

  -- 7. Log Activity Event
  INSERT INTO public.activity_events (workspace_id, release_id, actor_id, event_type, payload)
  VALUES (
    v_workspace_id,
    p_release_id,
    v_user_id,
    'release_changes_reordered',
    jsonb_build_object('items_count', v_json_items_count)
  );

  RETURN TRUE;
END;
$$;


-- ============================================================================
-- 5. GRANTS & SECURITY REVOKES
-- ============================================================================

-- Revoke default public access from security definer RPCs
REVOKE EXECUTE ON FUNCTION public.submit_release_for_review(uuid, uuid[], timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cast_release_vote(uuid, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_release(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.return_rejected_release_to_draft(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_published_release(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_release_changes(uuid, jsonb, timestamptz) FROM PUBLIC;

-- Explicitly grant execute rights only to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_release_for_review(uuid, uuid[], timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_release_vote(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_release(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_rejected_release_to_draft(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_published_release(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_release_changes(uuid, jsonb, timestamptz) TO authenticated;

COMMIT;