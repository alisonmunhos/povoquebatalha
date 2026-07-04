-- 1) Add secondary email/phone columns
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_secundario text,
  ADD COLUMN IF NOT EXISTS phone_secundario_raw text,
  ADD COLUMN IF NOT EXISTS phone_secundario_e164 text,
  ADD COLUMN IF NOT EXISTS phone_secundario_last8 text;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_sec_last8 ON public.contacts(phone_secundario_last8);
CREATE INDEX IF NOT EXISTS idx_contacts_email_sec_lower ON public.contacts (lower(email_secundario));

-- 2) Extend contacts_phone_fill to also normalize the secondary phone
CREATE OR REPLACE FUNCTION public.contacts_phone_fill()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
DECLARE p jsonb; p2 jsonb;
BEGIN
  IF NEW.nome IS NOT NULL THEN
    NEW.nome_normalizado := lower(public.unaccent(trim(NEW.nome)));
  END IF;

  IF NEW.phone_raw IS NOT NULL THEN
    p := private.parse_phone_br(NEW.phone_raw, NULL);
    NEW.phone_digits := p->>'phone_digits';
    NEW.phone_ddi := p->>'phone_ddi';
    NEW.phone_ddd := p->>'phone_ddd';
    NEW.phone_e164 := p->>'phone_e164';
    NEW.phone_last8 := p->>'phone_last8';
    NEW.phone_last9 := p->>'phone_last9';
    NEW.phone_whatsapp_candidate := p->>'phone_whatsapp_candidate';
    IF NEW.phone_status IS NULL THEN
      NEW.phone_status := (p->>'status')::public.contact_phone_status;
    END IF;
  END IF;

  -- Secundário: só e164 + last8 (para reconhecimento em mensagens recebidas).
  IF NEW.phone_secundario_raw IS NOT NULL AND length(btrim(NEW.phone_secundario_raw)) > 0 THEN
    p2 := private.parse_phone_br(NEW.phone_secundario_raw, NULL);
    NEW.phone_secundario_e164 := p2->>'phone_e164';
    NEW.phone_secundario_last8 := p2->>'phone_last8';
  ELSE
    NEW.phone_secundario_raw := NULL;
    NEW.phone_secundario_e164 := NULL;
    NEW.phone_secundario_last8 := NULL;
  END IF;

  IF NEW.lifecycle_status IS NULL THEN
    NEW.lifecycle_status := CASE NEW.origem
      WHEN 'import' THEN 'importado_aguardando_recadastro'::public.contact_lifecycle_status
      ELSE 'recadastro_concluido'::public.contact_lifecycle_status
    END;
  END IF;

  RETURN NEW;
END; $function$;

-- 3) Trigger precisa disparar também quando phone_secundario_raw muda
DROP TRIGGER IF EXISTS trg_contacts_phone_fill ON public.contacts;
CREATE TRIGGER trg_contacts_phone_fill
  BEFORE INSERT OR UPDATE OF nome, phone_raw, phone_secundario_raw, origem ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_phone_fill();

-- 4) merge_contacts: preservar email/telefone perdidos no campo secundário do sobrevivente
CREATE OR REPLACE FUNCTION public.merge_contacts(p_survivor uuid, p_merged uuid, p_field_overrides jsonb DEFAULT '{}'::jsonb, p_motivo text DEFAULT NULL::text, p_confianca text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_survivor public.contacts;
  v_merged public.contacts;
  v_merge_id uuid;
  v_key text;
  v_val text;
  v_updates jsonb := '{}'::jsonb;
  v_obs_a text;
  v_obs_b text;
  v_final_email text;
  v_final_phone_raw text;
  v_final_phone_e164 text;
BEGIN
  IF p_survivor = p_merged THEN
    RAISE EXCEPTION 'Sobrevivente e duplicado devem ser diferentes';
  END IF;

  SELECT * INTO v_survivor FROM public.contacts WHERE id = p_survivor FOR UPDATE;
  SELECT * INTO v_merged FROM public.contacts WHERE id = p_merged FOR UPDATE;
  IF v_survivor.id IS NULL OR v_merged.id IS NULL THEN
    RAISE EXCEPTION 'Contato não encontrado';
  END IF;

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

  IF p_field_overrides IS NOT NULL AND jsonb_typeof(p_field_overrides) = 'object' THEN
    FOR v_key, v_val IN SELECT key, value::text FROM jsonb_each_text(p_field_overrides) LOOP
      IF v_key IN (
        'nome','nome_social','email','phone_raw','cep','endereco','numero','complemento','referencia',
        'bairro','cidade','uf','profissao','tipo_contato','origem_detalhe','observacoes',
        'email_secundario','phone_secundario_raw'
      ) THEN
        v_updates := v_updates || jsonb_build_object(v_key, v_val);
      ELSIF v_key = 'coletivo_alicerce' THEN
        v_updates := v_updates || jsonb_build_object('coletivo_alicerce', (v_val::boolean));
      ELSIF v_key = 'consentimento_whatsapp' THEN
        v_updates := v_updates || jsonb_build_object('consentimento_whatsapp', (v_val::boolean));
      END IF;
    END LOOP;
  END IF;

  -- Descobrir e-mail/telefone finais do sobrevivente (após overrides)
  v_final_email := COALESCE(v_updates->>'email', v_survivor.email);
  v_final_phone_raw := COALESCE(v_updates->>'phone_raw', v_survivor.phone_raw);
  v_final_phone_e164 := v_survivor.phone_e164; -- será recomputado pelo trigger se phone_raw mudar

  -- Preservar e-mail perdido no email_secundario (se ainda vazio)
  IF v_merged.email IS NOT NULL
     AND btrim(v_merged.email) <> ''
     AND lower(coalesce(v_merged.email,'')) <> lower(coalesce(v_final_email,''))
     AND (v_updates ? 'email_secundario') IS FALSE
     AND coalesce(btrim(v_survivor.email_secundario), '') = ''
  THEN
    v_updates := v_updates || jsonb_build_object('email_secundario', v_merged.email);
  END IF;

  -- Preservar telefone perdido no phone_secundario_raw (se ainda vazio)
  IF v_merged.phone_raw IS NOT NULL
     AND btrim(v_merged.phone_raw) <> ''
     AND coalesce(v_merged.phone_e164,'') <> coalesce(v_final_phone_e164,'')
     AND coalesce(v_merged.phone_raw,'') <> coalesce(v_final_phone_raw,'')
     AND (v_updates ? 'phone_secundario_raw') IS FALSE
     AND coalesce(btrim(v_survivor.phone_secundario_raw), '') = ''
  THEN
    v_updates := v_updates || jsonb_build_object('phone_secundario_raw', v_merged.phone_raw);
  END IF;

  v_obs_a := COALESCE(v_survivor.observacoes, '');
  v_obs_b := COALESCE(v_merged.observacoes, '');
  IF length(v_obs_b) > 0 AND position(v_obs_b in v_obs_a) = 0 THEN
    v_updates := v_updates || jsonb_build_object(
      'observacoes',
      btrim(v_obs_a || E'\n--- Mesclado de ' || v_merged.nome || ' ---\n' || v_obs_b)
    );
  END IF;

  IF v_updates <> '{}'::jsonb THEN
    UPDATE public.contacts SET
      nome = COALESCE(v_updates->>'nome', nome),
      nome_social = COALESCE(v_updates->>'nome_social', nome_social),
      email = COALESCE(v_updates->>'email', email),
      email_secundario = COALESCE(v_updates->>'email_secundario', email_secundario),
      phone_raw = COALESCE(v_updates->>'phone_raw', phone_raw),
      phone_secundario_raw = COALESCE(v_updates->>'phone_secundario_raw', phone_secundario_raw),
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

  INSERT INTO public.contact_tags (contact_id, tag_id)
  SELECT p_survivor, tag_id FROM public.contact_tags WHERE contact_id = p_merged
  ON CONFLICT DO NOTHING;
  DELETE FROM public.contact_tags WHERE contact_id = p_merged;

  UPDATE public.contact_audit_log SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.message_events SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.inbound_messages SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.campaign_recipients SET contact_id = p_survivor WHERE contact_id = p_merged;

  UPDATE public.contact_duplicates
     SET status = 'mesclado', resolved_at = now(), resolved_by = auth.uid()
   WHERE status = 'pendente'
     AND ((contact_a = p_survivor AND contact_b = p_merged)
       OR (contact_a = p_merged AND contact_b = p_survivor));

  UPDATE public.contacts
     SET arquivado_at = COALESCE(arquivado_at, now()),
         lifecycle_status = 'duplicado_mesclado',
         opt_out_at = COALESCE(opt_out_at, now()),
         opt_out_motivo = COALESCE(opt_out_motivo, 'Mesclado em ' || p_survivor::text)
   WHERE id = p_merged;

  INSERT INTO public.contact_audit_log (contact_id, user_id, action, changes)
  VALUES (p_survivor, auth.uid(), 'merge_from', jsonb_build_object('merged_id', p_merged, 'merge_id', v_merge_id));

  RETURN v_merge_id;
END $function$;