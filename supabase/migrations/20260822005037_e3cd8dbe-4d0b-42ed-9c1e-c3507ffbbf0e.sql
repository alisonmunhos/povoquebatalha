DROP POLICY IF EXISTS "staff_view_auto_deliveries" ON public.automation_deliveries;
CREATE POLICY "inbox_view_auto_deliveries" ON public.automation_deliveries
FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.inbox_access = true
  )
);