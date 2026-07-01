
DROP POLICY IF EXISTS "auth read audit" ON public.contact_audit_log;
DROP POLICY IF EXISTS "auth insert audit" ON public.contact_audit_log;
CREATE POLICY "staff read audit" ON public.contact_audit_log FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "auth insert audit" ON public.contact_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth can read duplicates" ON public.contact_duplicates;
CREATE POLICY "staff can read duplicates" ON public.contact_duplicates FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
