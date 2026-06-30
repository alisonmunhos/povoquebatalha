
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.normalize_phone_br(input text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE digits text;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(input, '[^0-9]', '', 'g');
  digits := regexp_replace(digits, '^0+', '');
  IF length(digits) IN (12,13) AND left(digits,2) = '55' THEN RETURN '+' || digits; END IF;
  IF length(digits) IN (10,11) THEN RETURN '+55' || digits; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.phone_last8(input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN input IS NULL THEN NULL
    WHEN length(regexp_replace(input,'[^0-9]','','g')) < 8 THEN NULL
    ELSE right(regexp_replace(input,'[^0-9]','','g'),8)
  END;
$$;

CREATE TYPE public.app_role AS ENUM ('admin','operador','leitor');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','operador'))
$$;

CREATE OR REPLACE FUNCTION public.is_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id)
$$;

CREATE POLICY "user_roles read own or admin" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles admin manage" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles members read" ON public.profiles FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TYPE public.contact_origem AS ENUM ('recadastro','inscricao','import','manual');

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  phone_raw text,
  phone_e164 text,
  phone_last8 text,
  email text,
  cpf_hash text,
  cep text, endereco text, numero text, complemento text, bairro text, cidade text, uf text,
  lat double precision, lng double precision,
  origem public.contact_origem NOT NULL DEFAULT 'manual',
  consentimento_whatsapp boolean NOT NULL DEFAULT false,
  opt_out_at timestamptz,
  como_conheceu text,
  quer_voluntariar boolean,
  observacoes text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  opt_out_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_phone_e164 ON public.contacts(phone_e164);
CREATE INDEX idx_contacts_phone_last8 ON public.contacts(phone_last8);
CREATE INDEX idx_contacts_cidade ON public.contacts(cidade);
CREATE INDEX idx_contacts_uf ON public.contacts(uf);
CREATE INDEX idx_contacts_origem ON public.contacts(origem);
CREATE INDEX idx_contacts_created_at ON public.contacts(created_at DESC);
CREATE INDEX idx_contacts_nome_trgm ON public.contacts USING gin (nome gin_trgm_ops);
CREATE UNIQUE INDEX uniq_contacts_phone_e164 ON public.contacts(phone_e164) WHERE phone_e164 IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts members read" ON public.contacts FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "contacts staff insert" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "contacts staff update" ON public.contacts FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "contacts admin delete" ON public.contacts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.contacts_phone_fill()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phone_raw IS NOT NULL THEN
    NEW.phone_e164 := public.normalize_phone_br(NEW.phone_raw);
    NEW.phone_last8 := public.phone_last8(NEW.phone_raw);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_contacts_phone_fill BEFORE INSERT OR UPDATE OF phone_raw ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_phone_fill();

CREATE TYPE public.tag_categoria AS ENUM ('perfil','territorio','acao','interno','origem');

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#6366f1',
  categoria public.tag_categoria NOT NULL DEFAULT 'perfil',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags members read" ON public.tags FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "tags staff manage" ON public.tags FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contact_tags (
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX idx_contact_tags_tag ON public.contact_tags(tag_id);
GRANT SELECT, INSERT, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_tags members read" ON public.contact_tags FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "contact_tags staff manage" ON public.contact_tags FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  filtro jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT ALL ON public.segments TO service_role;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments members read" ON public.segments FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "segments staff manage" ON public.segments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_segments_updated_at BEFORE UPDATE ON public.segments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TYPE public.import_status AS ENUM ('pending','processing','done','error');

CREATE TABLE public.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  file_name text,
  status public.import_status NOT NULL DEFAULT 'pending',
  mapeamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  total int NOT NULL DEFAULT 0,
  criados int NOT NULL DEFAULT 0,
  atualizados int NOT NULL DEFAULT 0,
  duplicados int NOT NULL DEFAULT 0,
  erros int NOT NULL DEFAULT 0,
  erro_msg text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports members read" ON public.imports FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "imports staff manage" ON public.imports FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_imports_updated_at BEFORE UPDATE ON public.imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  linha int NOT NULL,
  raw jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_rows_import ON public.import_rows(import_id);
GRANT SELECT, INSERT, UPDATE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_rows members read" ON public.import_rows FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "import_rows staff manage" ON public.import_rows FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TYPE public.instance_status AS ENUM ('disconnected','qr','connected','error');

CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  provider text NOT NULL DEFAULT 'zapi',
  status public.instance_status NOT NULL DEFAULT 'disconnected',
  numero_conectado text,
  last_ping timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  rate_per_minute int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instances members read" ON public.whatsapp_instances FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "instances admin manage" ON public.whatsapp_instances FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.whatsapp_instances (nome, provider, status, config)
VALUES ('Z-API Principal','zapi','disconnected','{"uses_env_secrets": true}'::jsonb);

CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','running','paused','done','canceled');
CREATE TYPE public.campaign_tipo AS ENUM ('text','image','document','link');

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  tipo public.campaign_tipo NOT NULL DEFAULT 'text',
  mensagem_template text NOT NULL,
  midia_url text,
  midia_caption text,
  segment_id uuid REFERENCES public.segments(id),
  filtro_adhoc jsonb,
  instance_id uuid REFERENCES public.whatsapp_instances(id),
  status public.campaign_status NOT NULL DEFAULT 'draft',
  agendado_para timestamptz,
  janela_inicio time NOT NULL DEFAULT '09:00',
  janela_fim time NOT NULL DEFAULT '20:00',
  delay_min_ms int NOT NULL DEFAULT 4000,
  delay_max_ms int NOT NULL DEFAULT 9000,
  total_destinatarios int NOT NULL DEFAULT 0,
  total_enviados int NOT NULL DEFAULT 0,
  total_entregues int NOT NULL DEFAULT 0,
  total_lidos int NOT NULL DEFAULT 0,
  total_falhas int NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_agendado ON public.campaigns(agendado_para);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns members read" ON public.campaigns FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "campaigns staff manage" ON public.campaigns FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TYPE public.recipient_status AS ENUM ('queued','sending','sent','delivered','read','failed','opted_out','canceled');

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status public.recipient_status NOT NULL DEFAULT 'queued',
  rendered_message text,
  zaap_id text,
  message_id text,
  erro text,
  tentativas int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX idx_recipients_campaign_status ON public.campaign_recipients(campaign_id, status);
CREATE INDEX idx_recipients_status ON public.campaign_recipients(status);
CREATE INDEX idx_recipients_zaap_id ON public.campaign_recipients(zaap_id);
CREATE INDEX idx_recipients_message_id ON public.campaign_recipients(message_id);
CREATE INDEX idx_recipients_contact ON public.campaign_recipients(contact_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipients members read" ON public.campaign_recipients FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "recipients staff manage" ON public.campaign_recipients FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_recipients_updated_at BEFORE UPDATE ON public.campaign_recipients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_message_events_recipient ON public.message_events(recipient_id);
CREATE INDEX idx_message_events_contact ON public.message_events(contact_id);
CREATE INDEX idx_message_events_tipo ON public.message_events(tipo);
GRANT SELECT, INSERT ON public.message_events TO authenticated;
GRANT ALL ON public.message_events TO service_role;
ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events members read" ON public.message_events FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "events staff insert" ON public.message_events FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  from_phone text, from_name text, conteudo text, tipo text, payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inbound_received ON public.inbound_messages(received_at DESC);
CREATE INDEX idx_inbound_phone ON public.inbound_messages(from_phone);
GRANT SELECT ON public.inbound_messages TO authenticated;
GRANT ALL ON public.inbound_messages TO service_role;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound members read" ON public.inbound_messages FOR SELECT TO authenticated USING (public.is_member(auth.uid()));

CREATE TABLE public.webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL,
  provider text NOT NULL DEFAULT 'zapi',
  payload jsonb,
  processado boolean NOT NULL DEFAULT false,
  erro text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_log_received ON public.webhook_log(received_at DESC);
CREATE INDEX idx_webhook_log_evento ON public.webhook_log(evento);
GRANT SELECT ON public.webhook_log TO authenticated;
GRANT ALL ON public.webhook_log TO service_role;
ALTER TABLE public.webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_log admin read" ON public.webhook_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
