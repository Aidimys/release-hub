-- Allow authenticated users to manage release changes and update release status.

DROP POLICY IF EXISTS "Authenticated users can view release changes" ON public.release_changes;
CREATE POLICY "Authenticated users can view release changes"
  ON public.release_changes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create release changes" ON public.release_changes;
CREATE POLICY "Authenticated users can create release changes"
  ON public.release_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update release changes" ON public.release_changes;
CREATE POLICY "Authenticated users can update release changes"
  ON public.release_changes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update releases" ON public.releases;
CREATE POLICY "Authenticated users can update releases"
  ON public.releases
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
