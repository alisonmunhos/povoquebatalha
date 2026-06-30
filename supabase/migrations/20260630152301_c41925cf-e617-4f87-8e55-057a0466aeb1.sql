
CREATE POLICY "Staff read imports bucket" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id='imports' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff upload imports bucket" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id='imports' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff delete imports bucket" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id='imports' AND public.is_staff(auth.uid()));
