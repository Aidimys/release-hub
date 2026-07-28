-- Allow authenticated users to view and create releases in the app.

DROP POLICY IF EXISTS "Authenticated users can view releases" ON public.releases;
CREATE POLICY "Authenticated users can view releases"
  ON public.releases
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create releases" ON public.releases;
CREATE POLICY "Authenticated users can create releases"
  ON public.releases
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
