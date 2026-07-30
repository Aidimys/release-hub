-- Allow authenticated users to manage comments, reviewers and activity entries.

DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
CREATE POLICY "Authenticated users can view comments"
  ON public.comments
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Authenticated users can create comments"
  ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view release reviewers" ON public.release_reviewers;
CREATE POLICY "Authenticated users can view release reviewers"
  ON public.release_reviewers
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage release reviewers" ON public.release_reviewers;
CREATE POLICY "Authenticated users can manage release reviewers"
  ON public.release_reviewers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update release reviewers" ON public.release_reviewers;
CREATE POLICY "Authenticated users can update release reviewers"
  ON public.release_reviewers
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view activity events" ON public.activity_events;
CREATE POLICY "Authenticated users can view activity events"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create activity events" ON public.activity_events;
CREATE POLICY "Authenticated users can create activity events"
  ON public.activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
