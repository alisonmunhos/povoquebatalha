
DROP POLICY IF EXISTS "auth can manage duplicates" ON public.contact_duplicates;
CREATE POLICY "admins can manage duplicates" ON public.contact_duplicates
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
