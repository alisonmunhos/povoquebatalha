DROP POLICY IF EXISTS "events members read" ON public.message_events;
DROP POLICY IF EXISTS "events staff insert" ON public.message_events;

CREATE POLICY "events members read" ON public.message_events
  FOR SELECT TO authenticated
  USING (private.is_member(auth.uid()));

CREATE POLICY "events staff insert" ON public.message_events
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));