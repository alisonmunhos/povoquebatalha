CREATE POLICY tcl_delete_own_or_staff
ON public.territory_contact_logs
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'operador'::app_role)
  OR private.has_role(auth.uid(), 'vrm'::app_role)
  OR private.has_role(auth.uid(), 'territorio'::app_role)
);