ALTER TABLE public.territory_contact_logs
  ADD COLUMN IF NOT EXISTS follow_up_status text
    CHECK (follow_up_status IN ('pendente','concluido')),
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS territory_contact_logs_contact_created_idx
  ON public.territory_contact_logs (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS territory_contact_logs_pending_idx
  ON public.territory_contact_logs (contact_id) WHERE follow_up_status = 'pendente' AND hidden_at IS NULL;

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
WITH CHECK (true);