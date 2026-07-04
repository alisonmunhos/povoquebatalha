-- Frente 3: colunas de follow-up e ocultar em agitacao_contact_logs
ALTER TABLE public.agitacao_contact_logs
  ADD COLUMN IF NOT EXISTS follow_up_status text CHECK (follow_up_status IN ('pendente','concluido')),
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Frente 4: índice de apoio para a policy de edição do agitador
CREATE INDEX IF NOT EXISTS idx_cse_source_user_contact
  ON public.contact_source_events (source_user_id, contact_id);

-- Frente 4: policy — agitador pode atualizar contatos que ele mesmo captou
DROP POLICY IF EXISTS "contacts agitador update own captured" ON public.contacts;
CREATE POLICY "contacts agitador update own captured"
ON public.contacts
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'agitador'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.contact_source_events cse
    WHERE cse.contact_id = contacts.id
      AND cse.source_user_id = auth.uid()
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'agitador'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.contact_source_events cse
    WHERE cse.contact_id = contacts.id
      AND cse.source_user_id = auth.uid()
  )
);