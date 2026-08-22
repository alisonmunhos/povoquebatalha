CREATE TABLE public.whatsapp_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  opening_message text NOT NULL DEFAULT 'FAÇA PARTE DA NOSSA CAMPANHA!',
  closing_message text NOT NULL DEFAULT 'Prontinho! Seu cadastro foi feito. Obrigado por fazer parte. 💪',
  active boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  allow_update_existing boolean NOT NULL DEFAULT true,
  trigger_keywords text[] NOT NULL DEFAULT '{}',
  trigger_on_ad boolean NOT NULL DEFAULT false,
  trigger_ad_ids text[] NOT NULL DEFAULT '{}',
  trigger_on_first_contact boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_flows TO authenticated;
GRANT ALL ON public.whatsapp_flows TO service_role;
ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff/inbox view flows" ON public.whatsapp_flows
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR private.has_inbox_access(auth.uid()));
CREATE POLICY "admins manage flows" ON public.whatsapp_flows
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.whatsapp_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  catalog_field_key text NOT NULL,
  prompt text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  response_kind text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_flow_steps_kind_chk CHECK (
    response_kind IN ('text','single_choice','multi_choice','yes_no','address','email','date','number')
  )
);
CREATE INDEX whatsapp_flow_steps_flow_order_idx ON public.whatsapp_flow_steps (flow_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_flow_steps TO authenticated;
GRANT ALL ON public.whatsapp_flow_steps TO service_role;
ALTER TABLE public.whatsapp_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff/inbox view flow steps" ON public.whatsapp_flow_steps
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR private.has_inbox_access(auth.uid()));
CREATE POLICY "admins manage flow steps" ON public.whatsapp_flow_steps
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.whatsapp_flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'opening',
  current_step_index integer NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_multi jsonb NOT NULL DEFAULT '[]'::jsonb,
  invalid_attempts integer NOT NULL DEFAULT 0,
  trigger_kind text,
  ad_referral jsonb,
  last_prompt_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_flow_sessions_status_chk CHECK (
    status IN ('opening','running','completed','abandoned','paused','declined')
  )
);
CREATE INDEX whatsapp_flow_sessions_phone_idx ON public.whatsapp_flow_sessions (phone);
CREATE UNIQUE INDEX whatsapp_flow_sessions_open_phone_uidx
  ON public.whatsapp_flow_sessions (phone)
  WHERE status IN ('opening','running','paused');

GRANT SELECT ON public.whatsapp_flow_sessions TO authenticated;
GRANT ALL ON public.whatsapp_flow_sessions TO service_role;
ALTER TABLE public.whatsapp_flow_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff/inbox view flow sessions" ON public.whatsapp_flow_sessions
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR private.has_inbox_access(auth.uid()));

CREATE TRIGGER whatsapp_flows_updated_at BEFORE UPDATE ON public.whatsapp_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER whatsapp_flow_steps_updated_at BEFORE UPDATE ON public.whatsapp_flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER whatsapp_flow_sessions_updated_at BEFORE UPDATE ON public.whatsapp_flow_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();