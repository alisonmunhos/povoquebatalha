CREATE OR REPLACE FUNCTION public.detect_contact_duplicates_for(_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
        -- operador % usa o índice trigram de nome_normalizado (rápido);
        -- as regras finas (nome exato, subconjunto, similaridade) são
        -- avaliadas abaixo, já sobre um conjunto pequeno de candidatos
        OR (n.nome_normalizado IS NOT NULL AND c.nome_normalizado IS NOT NULL
            AND c.nome_normalizado % n.nome_normalizado)
      )
    LIMIT 50
  LOOP
    IF NOT (cand.m_phone OR cand.m_email OR cand.m_nome_exato
            OR cand.m_nome_subset OR cand.sim_nome >= 0.6) THEN
      CONTINUE;
    END IF;

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
      INSERT INTO public.contact_duplicates
        (contact_a, contact_b, match_type, reason, score)
      VALUES (pair_a, pair_b, v_match, v_reason, v_score);
      inserted := inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN inserted;
END $function$;