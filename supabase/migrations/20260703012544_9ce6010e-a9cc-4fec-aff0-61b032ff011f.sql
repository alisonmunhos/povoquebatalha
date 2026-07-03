
-- Restrict geocode_cache SELECT to staff members only
DROP POLICY IF EXISTS "auth read geocode_cache" ON public.geocode_cache;
CREATE POLICY "staff read geocode_cache" ON public.geocode_cache
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

-- Explicit deny INSERT for webhook_log from authenticated users; only service_role writes.
-- Add a restrictive-style policy documenting no authenticated inserts (leave service_role bypass intact).
CREATE POLICY "webhook_log deny authenticated insert" ON public.webhook_log
  FOR INSERT TO authenticated
  WITH CHECK (false);
