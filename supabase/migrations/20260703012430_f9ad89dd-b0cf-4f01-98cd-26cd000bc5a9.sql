
-- geocode_cache: restrict writes to admins (service_role bypasses RLS anyway)
CREATE POLICY "geocode_cache admin insert" ON public.geocode_cache
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "geocode_cache admin update" ON public.geocode_cache
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "geocode_cache admin delete" ON public.geocode_cache
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- profiles: explicit INSERT policy — users may only create their own profile row
-- (the handle_new_user trigger is SECURITY DEFINER and unaffected)
CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
