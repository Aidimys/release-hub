CREATE OR REPLACE FUNCTION public.find_profile_by_email(email_input TEXT)
RETURNS TABLE(id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(coalesce(u.email, '')) = lower(trim(email_input))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_profile_by_email(TEXT) TO authenticated;
