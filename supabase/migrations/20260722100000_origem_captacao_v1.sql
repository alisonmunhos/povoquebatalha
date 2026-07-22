-- Origem e captação v1: campos ativos, rastreio fino, importação e apply_contact_source.

DO $$ BEGIN
  CREATE TYPE public.capture_channel AS ENUM ('formulario_publico', 'captacao_atribuida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS tracking_name TEXT;

UPDATE public.form_definitions
   SET tracking_name = title
 WHERE tracking_name IS NULL OR trim(tracking_name) = '';

ALTER TABLE public.tracked_form_links
  ADD COLUMN IF NOT EXISTS form_definition_id UUID REFERENCES public.form_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tfl_form_definition ON public.tracked_form_links(form_definition_id);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS active_capture_channel public.capture_channel,
  ADD COLUMN IF NOT EXISTS active_captured_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_tracking_label TEXT,
  ADD COLUMN IF NOT EXISTS active_tracking_form_id UUID REFERENCES public.form_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_tracking_link_id UUID REFERENCES public.tracked_form_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_active_capture_channel ON public.contacts(active_capture_channel);
CREATE INDEX IF NOT EXISTS idx_contacts_active_tracking_label ON public.contacts(active_tracking_label);
CREATE INDEX IF NOT EXISTS idx_contacts_imported_by ON public.contacts(imported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_imported_at ON public.contacts(imported_at);

-- Backfill nome de rastreio em links de Entrada de Dados sem rótulo.
UPDATE public.tracked_form_links t
   SET label = f.tracking_name
  FROM public.form_definitions f
 WHERE t.form_definition_id = f.id
   AND (t.label IS NULL OR trim(t.label) = '');

UPDATE public.tracked_form_links t
   SET label = f.title,
       form_definition_id = f.id
  FROM public.form_definitions f
 WHERE f.tracked_form_link_id = t.id
   AND t.form_definition_id IS NULL
   AND (t.label IS NULL OR trim(t.label) = '');

CREATE OR REPLACE FUNCTION public.apply_contact_source(
  _contact_id UUID, _source_user_id UUID,
  _source_module public.source_module, _source_form_type public.source_form_type,
  _source_link_id UUID, _event_type public.source_event_type,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_has_primary BOOLEAN;
  v_is_system BOOLEAN;
  v_qualifying BOOLEAN;
  v_channel public.capture_channel;
  v_tracking_label TEXT;
  v_form_id UUID;
  v_meta JSONB;
BEGIN
  v_meta := COALESCE(_metadata, '{}'::jsonb);

  INSERT INTO public.contact_source_events(
    contact_id, source_user_id, source_module, source_form_type,
    source_link_id, event_type, metadata
  ) VALUES (_contact_id, _source_user_id, _source_module, _source_form_type,
    _source_link_id, _event_type, v_meta)
  RETURNING id INTO v_event_id;

  SELECT is_system_user INTO v_is_system FROM public.contacts WHERE id = _contact_id;

  IF _source_module = 'importacao' THEN
    UPDATE public.contacts SET
      imported_by_user_id = COALESCE(imported_by_user_id, _source_user_id),
      imported_at = COALESCE(imported_at, now())
    WHERE id = _contact_id;
  ELSE
    v_qualifying := COALESCE((v_meta->>'qualifying')::boolean,
      _event_type IN ('cadastro_completo', 'inscricao_simples'));

    IF v_qualifying AND NOT COALESCE(v_is_system, false) THEN
      IF v_meta ? 'capture_channel' AND v_meta->>'capture_channel' IN ('formulario_publico', 'captacao_atribuida') THEN
        v_channel := (v_meta->>'capture_channel')::public.capture_channel;
      ELSIF v_meta->>'via' = 'preenchido_por_agitador' OR (_source_user_id IS NOT NULL AND v_meta->>'via' IN ('recadastro_form', 'inscricao_form')) THEN
        v_channel := 'captacao_atribuida';
      ELSE
        v_channel := 'formulario_publico';
      END IF;

      v_tracking_label := NULLIF(trim(v_meta->>'tracking_label'), '');
      BEGIN
        v_form_id := NULLIF(v_meta->>'form_definition_id', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_form_id := NULL;
      END;

      UPDATE public.contacts SET
        active_capture_channel = v_channel,
        active_captured_by_user_id = CASE WHEN v_channel = 'formulario_publico' THEN NULL ELSE _source_user_id END,
        active_tracking_label = v_tracking_label,
        active_tracking_form_id = v_form_id,
        active_tracking_link_id = _source_link_id,
        source_captured_at = now()
      WHERE id = _contact_id;
    END IF;
  END IF;

  SELECT primary_source_module IS NOT NULL INTO v_has_primary
    FROM public.contacts WHERE id = _contact_id;

  UPDATE public.contacts SET
    primary_source_module = CASE WHEN v_has_primary THEN primary_source_module ELSE _source_module END,
    created_by_source_user_id = COALESCE(created_by_source_user_id, _source_user_id),
    last_source_module = _source_module,
    last_source_user_id = _source_user_id,
    source_form_type = COALESCE(_source_form_type, source_form_type),
    source_link_id = COALESCE(_source_link_id, source_link_id),
    source_captured_at = COALESCE(source_captured_at, now())
  WHERE id = _contact_id;

  IF _source_link_id IS NOT NULL THEN
    UPDATE public.tracked_form_links
       SET use_count = use_count + 1, updated_at = now()
     WHERE id = _source_link_id;
  END IF;

  RETURN v_event_id;
END $$;

REVOKE ALL ON FUNCTION public.apply_contact_source(uuid, uuid, public.source_module, public.source_form_type, uuid, public.source_event_type, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_contact_source(uuid, uuid, public.source_module, public.source_form_type, uuid, public.source_event_type, jsonb) TO service_role;

-- Backfill importação (bloco B).
UPDATE public.contacts c
   SET imported_by_user_id = COALESCE(c.imported_by_user_id, i.created_by),
       imported_at = COALESCE(c.imported_at, i.created_at)
  FROM public.imports i
 WHERE c.import_id = i.id
   AND c.is_system_user = false;

-- Cadastro presencial (preenchido por agitador).
UPDATE public.contacts
   SET active_capture_channel = 'captacao_atribuida',
       active_tracking_label = 'Cadastro presencial',
       active_captured_by_user_id = created_by_source_user_id
 WHERE origem_detalhe = 'preenchido_por_agitador'
   AND is_system_user = false
   AND active_capture_channel IS NULL;

-- Legado sem rastreio fino.
UPDATE public.contacts
   SET active_capture_channel = 'formulario_publico',
       active_tracking_label = 'Atualização (legado)'
 WHERE origem = 'recadastro'
   AND is_system_user = false
   AND active_capture_channel IS NULL
   AND origem_detalhe IS DISTINCT FROM 'preenchido_por_agitador';

UPDATE public.contacts
   SET active_capture_channel = 'formulario_publico',
       active_tracking_label = 'Inscrição (legado)'
 WHERE origem = 'inscricao'
   AND is_system_user = false
   AND active_capture_channel IS NULL;

-- Evidência de formulário Entrada de Dados (eventos com form_definition_id).
WITH latest_form AS (
  SELECT DISTINCT ON (e.contact_id)
    e.contact_id,
    (e.metadata->>'form_definition_id')::uuid AS form_id,
    COALESCE(fd.tracking_name, fd.title) AS tracking_label
  FROM public.contact_source_events e
  JOIN public.form_definitions fd ON fd.id = (e.metadata->>'form_definition_id')::uuid
  WHERE e.metadata ? 'form_definition_id'
    AND e.event_type IN ('cadastro_completo', 'inscricao_simples')
  ORDER BY e.contact_id, e.created_at DESC
)
UPDATE public.contacts c
   SET active_capture_channel = 'formulario_publico',
       active_tracking_label = lf.tracking_label,
       active_tracking_form_id = lf.form_id,
       active_captured_by_user_id = NULL
  FROM latest_form lf
 WHERE c.id = lf.contact_id
   AND c.is_system_user = false
   AND (c.active_capture_channel IS NULL OR c.active_tracking_label IS NULL);

-- Links nomeados com rótulo (captação atribuída) quando ainda sem origem ativa.
UPDATE public.contacts c
   SET active_capture_channel = 'captacao_atribuida',
       active_tracking_label = COALESCE(NULLIF(trim(l.label), ''), 'Link sem nome'),
       active_captured_by_user_id = l.created_by_user_id,
       active_tracking_link_id = l.id
  FROM public.tracked_form_links l
 WHERE c.source_link_id = l.id
   AND c.is_system_user = false
   AND c.active_capture_channel IS NULL
   AND l.source_module <> 'link_publico';
