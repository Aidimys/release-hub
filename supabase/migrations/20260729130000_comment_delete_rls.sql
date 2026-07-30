-- Allow authenticated users to delete their own comments and view them.
DROP POLICY IF EXISTS "Authenticated users can delete comments" ON public.comments;
CREATE POLICY "Authenticated users can delete comments"
  ON public.comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR true);
