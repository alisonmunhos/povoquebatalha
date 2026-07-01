
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS participa_movimento_social boolean,
  ADD COLUMN IF NOT EXISTS movimento_social_nome text;

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('system','quick_reply')),
  event_key text,
  shortcut text,
  title text NOT NULL,
  category text,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  link text,
  media_url text,
  active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_event_unique
  ON public.message_templates (event_key) WHERE kind = 'system' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS message_templates_shortcut_idx
  ON public.message_templates (shortcut) WHERE kind = 'quick_reply';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_templates" ON public.message_templates
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin_write_templates" ON public.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admin_update_templates" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admin_delete_templates" ON public.message_templates
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_message_templates_updated
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  template_id uuid NOT NULL REFERENCES public.message_templates(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  delay_seconds integer NOT NULL DEFAULT 0,
  require_consent boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_automations" ON public.automations
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin_write_automations" ON public.automations
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_automations_updated
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.automation_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','error','skipped')),
  error text,
  zapi_message_id text,
  rendered_body text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS automation_deliveries_unique
  ON public.automation_deliveries (automation_id, contact_id);
CREATE INDEX IF NOT EXISTS automation_deliveries_contact_idx
  ON public.automation_deliveries (contact_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_deliveries TO authenticated;
GRANT ALL ON public.automation_deliveries TO service_role;
ALTER TABLE public.automation_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_auto_deliveries" ON public.automation_deliveries
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin_write_auto_deliveries" ON public.automation_deliveries
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.message_templates (kind, event_key, title, category, body, variables, active)
VALUES
  ('system','atualizacao_apoiador_concluida','Confirmação de atualização','sistema',
    E'Olá, {{primeiro_nome}}! Sua atualização de apoiador foi concluída com sucesso.\n\nObrigado por confirmar suas informações.\n\nSalve este contato para continuar recebendo comunicados, materiais e convites para ações da Campanha do Povo que Batalha.\n\nPara deixar de receber mensagens, responda SAIR.',
    '["primeiro_nome","nome","cidade","bairro","link_atualizacao"]'::jsonb, true),
  ('system','inscricao_concluida','Confirmação de inscrição','sistema',
    E'Olá, {{primeiro_nome}}! Sua inscrição para receber atualizações da Campanha do Povo que Batalha foi confirmada.\n\nSalve este contato para acompanhar novidades, materiais e comunicados importantes.\n\nPara deixar de receber mensagens, responda SAIR.',
    '["primeiro_nome","nome","cidade","bairro","link_inscricao"]'::jsonb, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.automations (event_key, template_id, active, delay_seconds, require_consent)
SELECT t.event_key, t.id, false, 0, true
FROM public.message_templates t
WHERE t.kind = 'system'
  AND t.event_key IN ('atualizacao_apoiador_concluida','inscricao_concluida')
  AND NOT EXISTS (SELECT 1 FROM public.automations a WHERE a.event_key = t.event_key);
