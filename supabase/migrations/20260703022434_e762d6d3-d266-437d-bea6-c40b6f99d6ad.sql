DROP POLICY IF EXISTS tcl_update_own_or_staff ON public.territory_contact_logs;
CREATE POLICY tcl_update_own_or_staff
ON public.territory_contact_logs
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'operador'::app_role)
  OR private.has_role(auth.uid(), 'vrm'::app_role)
  OR private.has_role(auth.uid(), 'territorio'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'operador'::app_role)
  OR private.has_role(auth.uid(), 'vrm'::app_role)
  OR private.has_role(auth.uid(), 'territorio'::app_role)
);