
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agitador';

DO $$ BEGIN
  CREATE TYPE public.source_module AS ENUM (
    'gestao_base','territorio','agitacao','mapa','inbox','ficha_contato',
    'relacionamento','link_publico','formulario_publico','importacao','manual','outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.source_form_type AS ENUM ('cadastro_completo','receber_informacoes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.source_event_type AS ENUM (
    'contato_criado','contato_atualizado','inscricao_simples','cadastro_completo',
    'link_aberto','origem_atribuida'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agitacao_action AS ENUM (
    'whatsapp_aberto','contato_realizado','observacao','pediu_atualizacao','nao_respondeu'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tracked_form_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_module public.source_module NOT NULL,
  source_form_type public.source_form_type NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tracked_form_links TO authenticated;
GRANT ALL ON public.tracked_form_links TO service_role;
ALTER TABLE public.tracked_form_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tfl_select_own_or_admin" ON public.tracked_form_links FOR SELECT
TO authenticated USING (
  created_by_user_id = auth.uid()
  OR private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'vrm'::public.app_role)
);
CREATE POLICY "tfl_insert_own" ON public.tracked_form_links FOR INSERT
TO authenticated WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "tfl_update_own_or_admin" ON public.tracked_form_links FOR UPDATE
TO authenticated USING (
  created_by_user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::public.app_role)
);

CREATE INDEX IF NOT EXISTS idx_tfl_created_by ON public.tracked_form_links(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tfl_token ON public.tracked_form_links(token);

CREATE TRIGGER trg_tfl_updated_at BEFORE UPDATE ON public.tracked_form_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.contact_source_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_user_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  source_module public.source_module NOT NULL,
  source_form_type public.source_form_type,
  source_link_id UUID REFERENCES public.tracked_form_links(id) ON DELETE SET NULL,
  event_type public.source_event_type NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.contact_source_events TO authenticated;
GRANT ALL ON public.contact_source_events TO service_role;
ALTER TABLE public.contact_source_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cse_select" ON public.contact_source_events FOR SELECT
TO authenticated USING (
  source_user_id = auth.uid()
  OR private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'vrm'::public.app_role)
  OR private.has_role(auth.uid(),'territorio'::public.app_role)
  OR private.has_role(auth.uid(),'comunicacao'::public.app_role)
);
CREATE POLICY "cse_insert" ON public.contact_source_events FOR INSERT
TO authenticated WITH CHECK (
  source_user_id = auth.uid() OR private.has_role(auth.uid(),'admin'::public.app_role)
);

CREATE INDEX IF NOT EXISTS idx_cse_contact ON public.contact_source_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_cse_user ON public.contact_source_events(source_user_id);
CREATE INDEX IF NOT EXISTS idx_cse_link ON public.contact_source_events(source_link_id);
CREATE INDEX IF NOT EXISTS idx_cse_module ON public.contact_source_events(source_module);

CREATE TABLE IF NOT EXISTS public.agitacao_contact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  action public.agitacao_action NOT NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agitacao_contact_logs TO authenticated;
GRANT ALL ON public.agitacao_contact_logs TO service_role;
ALTER TABLE public.agitacao_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acl_select" ON public.agitacao_contact_logs FOR SELECT
TO authenticated USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'vrm'::public.app_role)
);
CREATE POLICY "acl_insert" ON public.agitacao_contact_logs FOR INSERT
TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_acl_user ON public.agitacao_contact_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_acl_contact ON public.agitacao_contact_logs(contact_id);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS primary_source_module public.source_module,
  ADD COLUMN IF NOT EXISTS last_source_module public.source_module,
  ADD COLUMN IF NOT EXISTS created_by_source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_form_type public.source_form_type,
  ADD COLUMN IF NOT EXISTS source_link_id UUID REFERENCES public.tracked_form_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_system_user BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_primary_source ON public.contacts(primary_source_module);
CREATE INDEX IF NOT EXISTS idx_contacts_last_source_user ON public.contacts(last_source_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by_source_user ON public.contacts(created_by_source_user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_contact ON public.profiles(contact_id);

CREATE OR REPLACE FUNCTION public.resolve_tracked_link(_token TEXT)
RETURNS TABLE(
  id UUID,
  source_module public.source_module,
  source_form_type public.source_form_type,
  is_active BOOLEAN,
  expired BOOLEAN,
  created_by_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.source_module, l.source_form_type, l.is_active,
    (l.expires_at IS NOT NULL AND l.expires_at < now()) AS expired,
    p.full_name AS created_by_name
  FROM public.tracked_form_links l
  LEFT JOIN public.profiles p ON p.id = l.created_by_user_id
  WHERE l.token = _token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_tracked_link(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_contact_source(
  _contact_id UUID, _source_user_id UUID,
  _source_module public.source_module, _source_form_type public.source_form_type,
  _source_link_id UUID, _event_type public.source_event_type,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event_id UUID; v_has_primary BOOLEAN;
BEGIN
  INSERT INTO public.contact_source_events(
    contact_id, source_user_id, source_module, source_form_type,
    source_link_id, event_type, metadata
  ) VALUES (_contact_id, _source_user_id, _source_module, _source_form_type,
    _source_link_id, _event_type, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO v_event_id;

  SELECT primary_source_module IS NOT NULL INTO v_has_primary
    FROM public.contacts WHERE id = _contact_id;

  UPDATE public.contacts SET
    primary_source_module = CASE WHEN v_has_primary THEN primary_source_module ELSE _source_module END,
    created_by_source_user_id = COALESCE(created_by_source_user_id, _source_user_id),
    last_source_module = _source_module,
    last_source_user_id = _source_user_id,
    source_form_type = COALESCE(_source_form_type, source_form_type),
    source_link_id = COALESCE(_source_link_id, source_link_id),
    source_captured_at = now()
  WHERE id = _contact_id;

  IF _source_link_id IS NOT NULL THEN
    UPDATE public.tracked_form_links
       SET use_count = use_count + 1, updated_at = now()
     WHERE id = _source_link_id;
  END IF;

  RETURN v_event_id;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_contact_source(UUID,UUID,public.source_module,public.source_form_type,UUID,public.source_event_type,JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.link_or_create_user_contact(
  _user_id UUID, _email TEXT, _phone TEXT, _full_name TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_contact_id UUID; v_phone_e164 TEXT;
BEGIN
  SELECT contact_id INTO v_contact_id FROM public.profiles WHERE id = _user_id;
  IF v_contact_id IS NOT NULL THEN RETURN v_contact_id; END IF;

  IF _email IS NOT NULL AND length(trim(_email)) > 0 THEN
    SELECT id INTO v_contact_id FROM public.contacts
     WHERE lower(email) = lower(trim(_email)) AND arquivado_at IS NULL
     ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_contact_id IS NULL AND _phone IS NOT NULL THEN
    v_phone_e164 := public.normalize_phone_br(_phone);
    IF v_phone_e164 IS NOT NULL THEN
      SELECT id INTO v_contact_id FROM public.contacts
       WHERE phone_e164 = v_phone_e164 AND arquivado_at IS NULL
       ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts(nome, email, phone_raw, origem, origem_detalhe, is_system_user)
    VALUES (COALESCE(NULLIF(trim(_full_name),''), _email, 'Usuário do sistema'),
            NULLIF(trim(_email),''), _phone, 'manual', 'system_user', true)
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts SET is_system_user = true WHERE id = v_contact_id;
  END IF;

  UPDATE public.profiles SET contact_id = v_contact_id WHERE id = _user_id;
  RETURN v_contact_id;
END $$;
GRANT EXECUTE ON FUNCTION public.link_or_create_user_contact(UUID,TEXT,TEXT,TEXT) TO authenticated, service_role;
