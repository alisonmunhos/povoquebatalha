
-- Direct messages (avulsas): mensagens 1:1 enviadas do inbox ou do mapa, fora de campanha
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origem TEXT NOT NULL CHECK (origem IN ('inbox','mapa','ficha','outro')),
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  inbound_id UUID REFERENCES public.inbound_messages(id) ON DELETE SET NULL,
  conteudo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','erro','cancelado')),
  erro TEXT,
  zaap_id TEXT,
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view direct messages"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "Staff can insert direct messages"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND sent_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_direct_messages_contact ON public.direct_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_origem ON public.direct_messages(origem, created_at DESC);

-- Inbox state on inbound_messages
ALTER TABLE public.inbound_messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_messages_contact_time ON public.inbound_messages(contact_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_unread ON public.inbound_messages(received_at DESC) WHERE read_at IS NULL;

-- Audit event helper for arbitrary logs (uses existing contact_audit_log)
-- (nothing to add; using existing table)
