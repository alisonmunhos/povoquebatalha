CREATE POLICY "acl_update_own_or_staff" ON public.agitacao_contact_logs
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'operador'::app_role)
  OR private.has_role(auth.uid(), 'vrm'::app_role)
  OR private.has_role(auth.uid(), 'agitador'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'operador'::app_role)
  OR private.has_role(auth.uid(), 'vrm'::app_role)
  OR private.has_role(auth.uid(), 'agitador'::app_role)
);