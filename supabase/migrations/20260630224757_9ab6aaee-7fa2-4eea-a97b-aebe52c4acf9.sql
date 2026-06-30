
-- 1) Tag categoria: novos valores
ALTER TYPE public.tag_categoria ADD VALUE IF NOT EXISTS 'interesse';
ALTER TYPE public.tag_categoria ADD VALUE IF NOT EXISTS 'prioridade';
ALTER TYPE public.tag_categoria ADD VALUE IF NOT EXISTS 'restricao';
ALTER TYPE public.tag_categoria ADD VALUE IF NOT EXISTS 'campanha';

-- 2) Tags: descrição
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS descricao text;

-- 3) Segmentos: tipo + membros estáticos
DO $$ BEGIN
  CREATE TYPE public.segment_tipo AS ENUM ('dinamico', 'estatico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.segments
  ADD COLUMN IF NOT EXISTS tipo public.segment_tipo NOT NULL DEFAULT 'dinamico',
  ADD COLUMN IF NOT EXISTS member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- 4) Contact merges: contexto
ALTER TABLE public.contact_merges
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS confianca text,
  ADD COLUMN IF NOT EXISTS field_choices jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5) Função merge_contacts
CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_survivor uuid,
  p_merged uuid,
  p_field_overrides jsonb DEFAULT '{}'::jsonb,
  p_motivo text DEFAULT NULL,
  p_confianca text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor public.contacts;
  v_merged public.contacts;
  v_merge_id uuid;
  v_key text;
  v_val text;
  v_updates jsonb := '{}'::jsonb;
  v_obs_a text;
  v_obs_b text;
BEGIN
  IF p_survivor = p_merged THEN
    RAISE EXCEPTION 'Sobrevivente e duplicado devem ser diferentes';
  END IF;

  SELECT * INTO v_survivor FROM public.contacts WHERE id = p_survivor FOR UPDATE;
  SELECT * INTO v_merged FROM public.contacts WHERE id = p_merged FOR UPDATE;
  IF v_survivor.id IS NULL OR v_merged.id IS NULL THEN
    RAISE EXCEPTION 'Contato não encontrado';
  END IF;

  -- Construir snapshot antes
  INSERT INTO public.contact_merges (survivor_id, merged_id, merged_snapshot, performed_by, motivo, confianca, field_choices)
  VALUES (
    p_survivor,
    p_merged,
    jsonb_build_object('survivor', row_to_json(v_survivor)::jsonb, 'merged', row_to_json(v_merged)::jsonb),
    auth.uid(),
    p_motivo,
    p_confianca,
    COALESCE(p_field_overrides, '{}'::jsonb)
  ) RETURNING id INTO v_merge_id;

  -- Aplicar overrides campo a campo
  IF p_field_overrides IS NOT NULL AND jsonb_typeof(p_field_overrides) = 'object' THEN
    FOR v_key, v_val IN SELECT key, value::text FROM jsonb_each_text(p_field_overrides) LOOP
      IF v_key IN (
        'nome','nome_social','email','phone_raw','cep','endereco','numero','complemento','referencia',
        'bairro','cidade','uf','profissao','tipo_contato','origem_detalhe','observacoes'
      ) THEN
        v_updates := v_updates || jsonb_build_object(v_key, v_val);
      ELSIF v_key = 'coletivo_alicerce' THEN
        v_updates := v_updates || jsonb_build_object('coletivo_alicerce', (v_val::boolean));
      ELSIF v_key = 'consentimento_whatsapp' THEN
        v_updates := v_updates || jsonb_build_object('consentimento_whatsapp', (v_val::boolean));
      END IF;
    END LOOP;
  END IF;

  -- Combinar observações automaticamente, preservando ambas
  v_obs_a := COALESCE(v_survivor.observacoes, '');
  v_obs_b := COALESCE(v_merged.observacoes, '');
  IF length(v_obs_b) > 0 AND position(v_obs_b in v_obs_a) = 0 THEN
    v_updates := v_updates || jsonb_build_object(
      'observacoes',
      btrim(v_obs_a || E'\n--- Mesclado de ' || v_merged.nome || ' ---\n' || v_obs_b)
    );
  END IF;

  -- Aplicar update no sobrevivente
  IF v_updates <> '{}'::jsonb THEN
    UPDATE public.contacts SET
      nome = COALESCE(v_updates->>'nome', nome),
      nome_social = COALESCE(v_updates->>'nome_social', nome_social),
      email = COALESCE(v_updates->>'email', email),
      phone_raw = COALESCE(v_updates->>'phone_raw', phone_raw),
      cep = COALESCE(v_updates->>'cep', cep),
      endereco = COALESCE(v_updates->>'endereco', endereco),
      numero = COALESCE(v_updates->>'numero', numero),
      complemento = COALESCE(v_updates->>'complemento', complemento),
      referencia = COALESCE(v_updates->>'referencia', referencia),
      bairro = COALESCE(v_updates->>'bairro', bairro),
      cidade = COALESCE(v_updates->>'cidade', cidade),
      uf = COALESCE(v_updates->>'uf', uf),
      profissao = COALESCE(v_updates->>'profissao', profissao),
      tipo_contato = COALESCE(v_updates->>'tipo_contato', tipo_contato),
      origem_detalhe = COALESCE(v_updates->>'origem_detalhe', origem_detalhe),
      observacoes = COALESCE(v_updates->>'observacoes', observacoes),
      coletivo_alicerce = COALESCE((v_updates->>'coletivo_alicerce')::boolean, coletivo_alicerce),
      consentimento_whatsapp = COALESCE((v_updates->>'consentimento_whatsapp')::boolean, consentimento_whatsapp)
    WHERE id = p_survivor;
  END IF;

  -- Transferir tags (ignorar duplicadas)
  INSERT INTO public.contact_tags (contact_id, tag_id)
  SELECT p_survivor, tag_id FROM public.contact_tags WHERE contact_id = p_merged
  ON CONFLICT DO NOTHING;
  DELETE FROM public.contact_tags WHERE contact_id = p_merged;

  -- Transferir históricos
  UPDATE public.contact_audit_log SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.message_events SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.inbound_messages SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.campaign_recipients SET contact_id = p_survivor WHERE contact_id = p_merged;

  -- Resolver duplicidades pendentes desse par
  UPDATE public.contact_duplicates
     SET status = 'mesclado', resolved_at = now(), resolved_by = auth.uid()
   WHERE status = 'pendente'
     AND ((contact_a = p_survivor AND contact_b = p_merged)
       OR (contact_a = p_merged AND contact_b = p_survivor));

  -- Marcar mesclado: arquivar + lifecycle duplicado_mesclado + opt_out p/ não receber
  UPDATE public.contacts
     SET arquivado_at = COALESCE(arquivado_at, now()),
         lifecycle_status = 'duplicado_mesclado',
         opt_out_at = COALESCE(opt_out_at, now()),
         opt_out_motivo = COALESCE(opt_out_motivo, 'Mesclado em ' || p_survivor::text)
   WHERE id = p_merged;

  -- Audit no sobrevivente
  INSERT INTO public.contact_audit_log (contact_id, user_id, action, changes)
  VALUES (p_survivor, auth.uid(), 'merge_from', jsonb_build_object('merged_id', p_merged, 'merge_id', v_merge_id));

  RETURN v_merge_id;
END $$;

REVOKE ALL ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) TO authenticated;
