-- 1) Detecção: regra de nome-subconjunto + inclui usuários do sistema
CREATE OR REPLACE FUNCTION public.name_tokens(_n text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _n IS NULL OR btrim(_n) = '' THEN NULL
    ELSE (
      SELECT array_agg(t) FROM unnest(regexp_split_to_array(btrim(lower(public.unaccent(_n))), '\s+')) t
      WHERE length(t) > 1 AND t NOT IN ('de','da','do','das','dos','e')
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.name_is_subset(_a text, _b text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  WITH t AS (SELECT public.name_tokens(_a) a, public.name_tokens(_b) b)
  SELECT COALESCE(
    array_length(a,1) >= 2 AND array_length(b,1) >= 2
    AND a <> b
    AND (a <@ b OR b <@ a)
    AND a[1] = b[1]
    AND a[array_length(a,1)] = b[array_length(b,1)]
  , false)
  FROM t;
$$;

CREATE OR REPLACE FUNCTION public.detect_contact_duplicates_for(_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  n public.contacts;
  cand record;
  pair_a uuid;
  pair_b uuid;
  inserted integer := 0;
  v_match text;
  v_reason text;
  v_score real;
BEGIN
  SELECT * INTO n FROM public.contacts WHERE id = _id;
  IF n.id IS NULL OR n.arquivado_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  FOR cand IN
    SELECT c.id,
      (n.phone_last8 IS NOT NULL AND c.phone_last8 = n.phone_last8) AS m_phone,
      (n.email IS NOT NULL AND length(btrim(n.email)) > 0
        AND c.email IS NOT NULL AND lower(c.email) = lower(n.email))         AS m_email,
      (n.nome_normalizado IS NOT NULL
        AND c.nome_normalizado = n.nome_normalizado)                          AS m_nome_exato,
      public.name_is_subset(c.nome, n.nome)                                   AS m_nome_subset,
      CASE
        WHEN n.nome_normalizado IS NOT NULL AND c.nome_normalizado IS NOT NULL
             AND c.nome_normalizado <> n.nome_normalizado
        THEN public.similarity(c.nome_normalizado, n.nome_normalizado)
        ELSE 0
      END AS sim_nome
    FROM public.contacts c
    WHERE c.id <> n.id
      AND c.arquivado_at IS NULL
      AND (
        (n.phone_last8 IS NOT NULL AND c.phone_last8 = n.phone_last8)
        OR (n.email IS NOT NULL AND length(btrim(n.email)) > 0
            AND c.email IS NOT NULL AND lower(c.email) = lower(n.email))
        OR (n.nome_normalizado IS NOT NULL
            AND c.nome_normalizado = n.nome_normalizado)
        OR (n.nome_normalizado IS NOT NULL AND c.nome_normalizado IS NOT NULL
            AND public.similarity(c.nome_normalizado, n.nome_normalizado) >= 0.6)
        OR public.name_is_subset(c.nome, n.nome)
      )
    LIMIT 50
  LOOP
    IF (cand.m_phone OR cand.m_email) AND (cand.m_nome_exato OR cand.m_nome_subset OR cand.sim_nome >= 0.6) THEN
      v_match := 'forte';
    ELSIF cand.m_phone OR cand.m_email OR cand.m_nome_exato OR cand.m_nome_subset THEN
      v_match := 'provavel';
    ELSE
      v_match := 'possivel';
    END IF;

    v_reason := 'Detecção automática: ' || array_to_string(ARRAY[
      CASE WHEN cand.m_phone THEN 'mesmo telefone' END,
      CASE WHEN cand.m_email THEN 'mesmo e-mail' END,
      CASE WHEN cand.m_nome_exato THEN 'mesmo nome' END,
      CASE WHEN cand.m_nome_subset THEN 'nome abreviado/completo' END,
      CASE WHEN NOT cand.m_nome_exato AND NOT cand.m_nome_subset AND cand.sim_nome >= 0.6
           THEN 'nome parecido (' || round(cand.sim_nome::numeric, 2)::text || ')' END
    ]::text[], ', ');

    v_score := GREATEST(
      CASE WHEN cand.m_phone THEN 1.0 ELSE 0 END,
      CASE WHEN cand.m_email THEN 1.0 ELSE 0 END,
      CASE WHEN cand.m_nome_exato THEN 0.9 ELSE 0 END,
      CASE WHEN cand.m_nome_subset THEN 0.85 ELSE 0 END,
      cand.sim_nome
    )::real;

    pair_a := LEAST(n.id, cand.id);
    pair_b := GREATEST(n.id, cand.id);

    IF EXISTS (
      SELECT 1 FROM public.contact_duplicates
       WHERE (contact_a = pair_a AND contact_b = pair_b)
          OR (contact_a = pair_b AND contact_b = pair_a)
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.contact_duplicates (contact_a, contact_b, match_type, reason, score)
      VALUES (pair_a, pair_b, v_match, v_reason, v_score);
      inserted := inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN inserted;
END $function$;

-- Revarredura completa da base
CREATE OR REPLACE FUNCTION public.rescan_contact_duplicates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE r record; total integer := 0;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  FOR r IN SELECT id FROM public.contacts WHERE arquivado_at IS NULL LOOP
    total := total + public.detect_contact_duplicates_for(r.id);
  END LOOP;
  RETURN total;
END $function$;

REVOKE ALL ON FUNCTION public.rescan_contact_duplicates() FROM public;
GRANT EXECUTE ON FUNCTION public.rescan_contact_duplicates() TO authenticated, service_role;

-- 2) Mesclagem completa
CREATE OR REPLACE FUNCTION public.merge_contacts(p_survivor uuid, p_merged uuid, p_field_overrides jsonb DEFAULT '{}'::jsonb, p_motivo text DEFAULT NULL::text, p_confianca text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_prof_survivor uuid;
  v_prof_merged uuid;
  v_conv_survivor uuid;
  v_conv_merged uuid;
  v_col text;
BEGIN
  IF p_survivor = p_merged THEN
    RAISE EXCEPTION 'Sobrevivente e duplicado devem ser diferentes';
  END IF;

  SELECT * INTO v_survivor FROM public.contacts WHERE id = p_survivor FOR UPDATE;
  SELECT * INTO v_merged FROM public.contacts WHERE id = p_merged FOR UPDATE;
  IF v_survivor.id IS NULL OR v_merged.id IS NULL THEN
    RAISE EXCEPTION 'Contato não encontrado';
  END IF;

  SELECT id INTO v_prof_survivor FROM public.profiles WHERE contact_id = p_survivor LIMIT 1;
  SELECT id INTO v_prof_merged FROM public.profiles WHERE contact_id = p_merged LIMIT 1;
  IF v_prof_survivor IS NOT NULL AND v_prof_merged IS NOT NULL AND v_prof_survivor <> v_prof_merged THEN
    RAISE EXCEPTION 'Os dois contatos são usuários com login diferente. Desative um dos acessos antes de mesclar.';
  END IF;

  INSERT INTO public.contact_merges (survivor_id, merged_id, merged_snapshot, performed_by, motivo, confianca, field_choices)
  VALUES (
    p_survivor, p_merged,
    jsonb_build_object('survivor', row_to_json(v_survivor)::jsonb, 'merged', row_to_json(v_merged)::jsonb),
    auth.uid(), p_motivo, p_confianca, COALESCE(p_field_overrides, '{}'::jsonb)
  ) RETURNING id INTO v_merge_id;

  -- Overrides explícitos do operador
  IF p_field_overrides IS NOT NULL AND jsonb_typeof(p_field_overrides) = 'object' THEN
    FOR v_key, v_val IN SELECT key, value::text FROM jsonb_each_text(p_field_overrides) LOOP
      IF v_key IN (
        'nome','nome_social','email','phone_raw','cep','endereco','numero','complemento','referencia',
        'bairro','cidade','uf','profissao','tipo_contato','origem_detalhe','observacoes',
        'email_secundario','phone_secundario_raw','instituicao','quem_indicou','rede_social',
        'zona_eleitoral','faixa_etaria','movimento_social_nome','formas_ajuda_outro'
      ) THEN
        v_updates := v_updates || jsonb_build_object(v_key, v_val);
      ELSIF v_key IN ('coletivo_alicerce','consentimento_whatsapp','consentimento_lgpd','consentimento_dados_sensiveis','participa_movimento_social') THEN
        v_updates := v_updates || jsonb_build_object(v_key, (v_val::boolean));
      END IF;
    END LOOP;
  END IF;

  -- Herança automática: campos em branco no sobrevivente recebem o valor do absorvido
  FOREACH v_col IN ARRAY ARRAY[
    'nome_social','email','phone_raw','cep','endereco','numero','complemento','referencia',
    'bairro','cidade','uf','profissao','tipo_contato','origem_detalhe','instituicao',
    'quem_indicou','rede_social','zona_eleitoral','faixa_etaria','movimento_social_nome','formas_ajuda_outro'
  ] LOOP
    IF NOT (v_updates ? v_col)
       AND coalesce(btrim(to_jsonb(v_survivor)->>v_col), '') = ''
       AND coalesce(btrim(to_jsonb(v_merged)->>v_col), '') <> '' THEN
      v_updates := v_updates || jsonb_build_object(v_col, to_jsonb(v_merged)->>v_col);
    END IF;
  END LOOP;

  v_final_email := COALESCE(v_updates->>'email', v_survivor.email);
  v_final_phone_raw := COALESCE(v_updates->>'phone_raw', v_survivor.phone_raw);
  v_final_phone_e164 := v_survivor.phone_e164;

  IF v_merged.email IS NOT NULL AND btrim(v_merged.email) <> ''
     AND lower(coalesce(v_merged.email,'')) <> lower(coalesce(v_final_email,''))
     AND (v_updates ? 'email_secundario') IS FALSE
     AND coalesce(btrim(v_survivor.email_secundario), '') = ''
  THEN
    v_updates := v_updates || jsonb_build_object('email_secundario', v_merged.email);
  END IF;

  IF v_merged.phone_raw IS NOT NULL AND btrim(v_merged.phone_raw) <> ''
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
      'observacoes', btrim(v_obs_a || E'\n--- Mesclado de ' || v_merged.nome || ' ---\n' || v_obs_b));
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
      instituicao = COALESCE(v_updates->>'instituicao', instituicao),
      quem_indicou = COALESCE(v_updates->>'quem_indicou', quem_indicou),
      rede_social = COALESCE(v_updates->>'rede_social', rede_social),
      zona_eleitoral = COALESCE(v_updates->>'zona_eleitoral', zona_eleitoral),
      faixa_etaria = COALESCE(v_updates->>'faixa_etaria', faixa_etaria),
      movimento_social_nome = COALESCE(v_updates->>'movimento_social_nome', movimento_social_nome),
      formas_ajuda_outro = COALESCE(v_updates->>'formas_ajuda_outro', formas_ajuda_outro),
      observacoes = COALESCE(v_updates->>'observacoes', observacoes),
      coletivo_alicerce = COALESCE((v_updates->>'coletivo_alicerce')::boolean, coletivo_alicerce),
      participa_movimento_social = COALESCE((v_updates->>'participa_movimento_social')::boolean, participa_movimento_social),
      consentimento_whatsapp = COALESCE((v_updates->>'consentimento_whatsapp')::boolean, consentimento_whatsapp),
      consentimento_lgpd = COALESCE((v_updates->>'consentimento_lgpd')::boolean, consentimento_lgpd),
      consentimento_dados_sensiveis = COALESCE((v_updates->>'consentimento_dados_sensiveis')::boolean, consentimento_dados_sensiveis)
    WHERE id = p_survivor;
  END IF;

  -- Tags
  INSERT INTO public.contact_tags (contact_id, tag_id)
  SELECT p_survivor, tag_id FROM public.contact_tags WHERE contact_id = p_merged
  ON CONFLICT DO NOTHING;
  DELETE FROM public.contact_tags WHERE contact_id = p_merged;

  -- Vínculos simples
  UPDATE public.contact_audit_log      SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.message_events         SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.inbound_messages       SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.campaign_recipients    SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.direct_messages        SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.automation_deliveries  SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.territory_contact_logs SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.agitacao_contact_logs  SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.form_custom_answers    SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.auto_reply_log         SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.import_rows            SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.push_subscriptions     SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.contact_source_events  SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.contact_source_events  SET source_user_contact_id = p_survivor WHERE source_user_contact_id = p_merged;
  UPDATE public.agitation_tasks        SET assigned_contact_id = p_survivor WHERE assigned_contact_id = p_merged;

  -- Vínculos com unicidade: remove o conflitante do absorvido, move o resto
  DELETE FROM public.event_rsvps e
   WHERE e.contact_id = p_merged
     AND EXISTS (SELECT 1 FROM public.event_rsvps s WHERE s.contact_id = p_survivor AND s.event_id = e.event_id);
  UPDATE public.event_rsvps SET contact_id = p_survivor WHERE contact_id = p_merged;

  DELETE FROM public.agitation_tasks t
   WHERE t.contact_id = p_merged
     AND EXISTS (SELECT 1 FROM public.agitation_tasks s WHERE s.contact_id = p_survivor AND s.mission_id = t.mission_id);
  UPDATE public.agitation_tasks SET contact_id = p_survivor WHERE contact_id = p_merged;

  DELETE FROM public.agitation_link_pauses l
   WHERE l.contact_id = p_merged
     AND EXISTS (SELECT 1 FROM public.agitation_link_pauses s WHERE s.contact_id = p_survivor AND s.mission_id = l.mission_id);
  UPDATE public.agitation_link_pauses SET contact_id = p_survivor WHERE contact_id = p_merged;

  -- Conversas: funde numa só
  SELECT id INTO v_conv_survivor FROM public.conversations WHERE contact_id = p_survivor LIMIT 1;
  SELECT id INTO v_conv_merged   FROM public.conversations WHERE contact_id = p_merged   LIMIT 1;
  IF v_conv_merged IS NOT NULL THEN
    IF v_conv_survivor IS NULL THEN
      UPDATE public.conversations SET contact_id = p_survivor WHERE id = v_conv_merged;
    ELSE
      UPDATE public.conversation_events SET conversation_id = v_conv_survivor WHERE conversation_id = v_conv_merged;
      UPDATE public.conversations s SET
        unread_count = s.unread_count + m.unread_count,
        last_message_at = GREATEST(COALESCE(s.last_message_at, m.last_message_at), COALESCE(m.last_message_at, s.last_message_at)),
        last_message_preview = CASE WHEN COALESCE(m.last_message_at,'-infinity'::timestamptz) > COALESCE(s.last_message_at,'-infinity'::timestamptz)
                                    THEN m.last_message_preview ELSE s.last_message_preview END,
        last_message_direction = CASE WHEN COALESCE(m.last_message_at,'-infinity'::timestamptz) > COALESCE(s.last_message_at,'-infinity'::timestamptz)
                                    THEN m.last_message_direction ELSE s.last_message_direction END,
        updated_at = now()
      FROM public.conversations m
      WHERE s.id = v_conv_survivor AND m.id = v_conv_merged;
      DELETE FROM public.conversations WHERE id = v_conv_merged;
    END IF;
  END IF;

  -- Usuário do sistema: o login segue com o sobrevivente
  IF v_prof_merged IS NOT NULL THEN
    UPDATE public.profiles SET contact_id = p_survivor WHERE id = v_prof_merged;
  END IF;
  IF v_merged.is_system_user THEN
    UPDATE public.contacts
       SET is_system_user = true,
           system_role = COALESCE(system_role, v_merged.system_role)
     WHERE id = p_survivor;
  END IF;

  UPDATE public.contact_duplicates
     SET status = 'mesclado', resolved_at = now(), resolved_by = auth.uid()
   WHERE status = 'pendente'
     AND (contact_a IN (p_survivor, p_merged) OR contact_b IN (p_survivor, p_merged))
     AND (contact_a = p_merged OR contact_b = p_merged);

  UPDATE public.contacts
     SET arquivado_at = COALESCE(arquivado_at, now()),
         lifecycle_status = 'duplicado_mesclado',
         is_system_user = false,
         opt_out_at = COALESCE(opt_out_at, now()),
         opt_out_motivo = COALESCE(opt_out_motivo, 'Mesclado em ' || p_survivor::text)
   WHERE id = p_merged;

  INSERT INTO public.contact_audit_log (contact_id, user_id, action, changes)
  VALUES (p_survivor, auth.uid(), 'merge_from', jsonb_build_object('merged_id', p_merged, 'merge_id', v_merge_id));

  RETURN v_merge_id;
END $function$;
