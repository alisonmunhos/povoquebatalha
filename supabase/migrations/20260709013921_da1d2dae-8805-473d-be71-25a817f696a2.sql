-- Resposta automática por palavra-gatilho: config (auto_reply_triggers) + log de
-- respostas enviadas (auto_reply_log), usado tanto para auditoria quanto pro
-- cooldown anti-spam (o webhook é stateless entre chamadas, precisa persistir isso).
CREATE TABLE IF NOT EXISTS public.auto_reply_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase text NOT NULL,
  response_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_reply_triggers TO authenticated;
GRANT ALL ON public.auto_reply_triggers TO service_role;
ALTER TABLE public.auto_reply_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_auto_reply_triggers" ON public.auto_reply_triggers
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin_write_auto_reply_triggers" ON public.auto_reply_triggers
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_auto_reply_triggers_updated
  BEFORE UPDATE ON public.auto_reply_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.auto_reply_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES public.auto_reply_triggers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  replied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_reply_log_trigger_phone
  ON public.auto_reply_log (trigger_id, phone, replied_at DESC);

-- Só o webhook (supabaseAdmin/service_role) grava aqui — sem policy de INSERT
-- pra authenticated, staff só enxerga (auditoria).
GRANT SELECT ON public.auto_reply_log TO authenticated;
GRANT ALL ON public.auto_reply_log TO service_role;
ALTER TABLE public.auto_reply_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_auto_reply_log" ON public.auto_reply_log
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
