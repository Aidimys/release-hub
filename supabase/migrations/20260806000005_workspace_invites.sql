BEGIN;

-- =============================================================================
-- 1. invite_status enum
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
  END IF;
END $$;

-- =============================================================================
-- 2. workspace_invites table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        public.workspace_role NOT NULL,
  token_hash  text NOT NULL,
  status      public.invite_status DEFAULT 'pending' NOT NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT workspace_invites_email_check CHECK (btrim(email) <> '')
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_token_hash
  ON public.workspace_invites(token_hash);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_status
  ON public.workspace_invites(workspace_id, status);

-- =============================================================================
-- 3. RLS policies — only the SECURITY DEFINER RPC functions may write;
--    SELECT is restricted to workspace owners.
-- =============================================================================
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_invites_select"
  ON public.workspace_invites
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_workspace_role(workspace_id, auth.uid()) = 'owner'
  );

-- No INSERT / UPDATE / DELETE policies → direct table access blocked for RLS.
-- Only SECURITY DEFINER functions can mutate the table.

GRANT ALL ON TABLE public.workspace_invites TO anon;
GRANT ALL ON TABLE public.workspace_invites TO authenticated;
GRANT ALL ON TABLE public.workspace_invites TO service_role;

-- =============================================================================
-- 4. Drop the old, broken invite_member RPC
-- =============================================================================
DROP FUNCTION IF EXISTS public.invite_member(uuid, text, public.workspace_role);

-- =============================================================================
-- 5. create_invite — creates a pending invite with a secure, hashed token
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_invite(
  p_workspace_id uuid,
  p_email        text,
  p_role         public.workspace_role
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id   uuid := auth.uid();
  v_token             text;
  v_token_hash        text;
  v_existing_member   boolean;
  v_existing_invite   boolean;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Permission: only owners can invite
  IF public.get_user_workspace_role(p_workspace_id, v_current_user_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can invite members';
  END IF;

  -- Block owner role
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite a user as owner';
  END IF;

  -- Already a member?
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        lower(wm.invited_email) = lower(trim(p_email))
        OR wm.user_id IN (
          SELECT id FROM auth.users
          WHERE lower(email) = lower(trim(p_email))
        )
      )
  ) INTO v_existing_member;

  IF v_existing_member THEN
    RAISE EXCEPTION 'User is already a member of this workspace';
  END IF;

  -- Active pending invite already exists?
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_invites wi
    WHERE wi.workspace_id = p_workspace_id
      AND lower(wi.email) = lower(trim(p_email))
      AND wi.status = 'pending'
      AND wi.expires_at > now()
  ) INTO v_existing_invite;

  IF v_existing_invite THEN
    RAISE EXCEPTION 'An active invitation already exists for this email';
  END IF;

  -- Generate secure token + hash (built-in functions, no pgcrypto required)
  v_token      := gen_random_uuid()::text || gen_random_uuid()::text;
  v_token_hash := md5(v_token);

  INSERT INTO public.workspace_invites (
    workspace_id, email, role, token_hash, status, expires_at, created_at, updated_at
  ) VALUES (
    p_workspace_id,
    trim(p_email),
    p_role,
    v_token_hash,
    'pending',
    now() + interval '7 days',
    now(),
    now()
  );

  -- Activity log
  INSERT INTO public.activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    p_workspace_id,
    v_current_user_id,
    'invite_created',
    jsonb_build_object('email', trim(p_email), 'role', p_role::text)
  );

  -- Return raw token so the caller can deliver it to the invitee
  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invite(uuid, text, public.workspace_role) TO authenticated;
GRANT ALL ON FUNCTION public.create_invite(uuid, text, public.workspace_role) TO anon;
GRANT ALL ON FUNCTION public.create_invite(uuid, text, public.workspace_role) TO service_role;

-- =============================================================================
-- 6. accept_invite — validates token, checks expiry, email match, creates member
-- =============================================================================
CREATE OR REPLACE FUNCTION public.accept_invite(
  p_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := auth.uid();
  v_invite          public.workspace_invites%ROWTYPE;
  v_token_hash      text;
  v_user_email      text;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Hash provided token and look up the invite
  v_token_hash := md5(p_token);

  SELECT * INTO v_invite
  FROM public.workspace_invites
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'Invitation has already been accepted';
  END IF;

  IF v_invite.status = 'revoked' THEN
    RAISE EXCEPTION 'Invitation has been revoked';
  END IF;

  IF v_invite.status = 'expired' THEN
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Expiration check
  IF v_invite.expires_at < now() THEN
    UPDATE public.workspace_invites
    SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Verify current user email matches the invitation email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_current_user_id;

  IF lower(coalesce(v_user_email, '')) IS DISTINCT FROM lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invitation is for a different email address';
  END IF;

  -- Already a member?
  IF EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = v_invite.workspace_id
      AND user_id = v_current_user_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this workspace';
  END IF;

  -- Create membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_email, status)
  VALUES (v_invite.workspace_id, v_current_user_id, v_invite.role, v_invite.email, 'active');

  -- Mark invite accepted
  UPDATE public.workspace_invites
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = v_invite.id;

  -- Activity log
  INSERT INTO public.activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    v_invite.workspace_id,
    v_current_user_id,
    'invite_accepted',
    jsonb_build_object('email', v_invite.email)
  );

  RETURN 'Invitation accepted successfully';
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_invite(text) TO anon;
GRANT ALL ON FUNCTION public.accept_invite(text) TO service_role;

-- =============================================================================
-- 7. revoke_invite — owner revokes a pending invite
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revoke_invite(
  p_invite_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := auth.uid();
  v_invite          public.workspace_invites%ROWTYPE;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = p_invite_id;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF public.get_user_workspace_role(v_invite.workspace_id, v_current_user_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can revoke invitations';
  END IF;

  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot revoke an accepted invitation';
  END IF;

  UPDATE public.workspace_invites
  SET status = 'revoked', updated_at = now()
  WHERE id = p_invite_id;

  INSERT INTO public.activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    v_invite.workspace_id,
    v_current_user_id,
    'invite_revoked',
    jsonb_build_object('email', v_invite.email)
  );

  RETURN 'Invitation revoked';
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_invite(uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_invite(uuid) TO service_role;

-- =============================================================================
-- 8. resend_invite — generates a new token for an existing pending invite
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resend_invite(
  p_invite_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := auth.uid();
  v_invite          public.workspace_invites%ROWTYPE;
  v_new_token       text;
  v_new_token_hash  text;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.workspace_invites WHERE id = p_invite_id;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF public.get_user_workspace_role(v_invite.workspace_id, v_current_user_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can resend invitations';
  END IF;

  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot resend an accepted invitation';
  END IF;

  IF v_invite.status = 'revoked' THEN
    RAISE EXCEPTION 'Cannot resend a revoked invitation';
  END IF;

  -- Generate new token + hash
  v_new_token      := gen_random_uuid()::text || gen_random_uuid()::text;
  v_new_token_hash := md5(v_new_token);

  UPDATE public.workspace_invites
  SET token_hash  = v_new_token_hash,
      status      = 'pending',
      expires_at  = now() + interval '7 days',
      updated_at  = now()
  WHERE id = p_invite_id;

  INSERT INTO public.activity_events (workspace_id, actor_id, event_type, payload)
  VALUES (
    v_invite.workspace_id,
    v_current_user_id,
    'invite_resent',
    jsonb_build_object('email', v_invite.email)
  );

  RETURN v_new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_invite(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resend_invite(uuid) TO anon;
GRANT ALL ON FUNCTION public.resend_invite(uuid) TO service_role;

COMMIT;
