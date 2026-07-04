-- 1) Função de detecção (SECURITY DEFINER para gravar em contact_duplicates
--    independente da política do usuário que originou o INSERT).
CREATE OR REPLACE FUNCTION public.detect_contact_duplicates_for(_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT c.id, c.nome, c.nome_normalizado, c.email, c.phone_last8,
      (n.phone_last8 IS NOT NULL AND c.phone_last8 = n.phone_last8) AS m_phone,
      (n.email IS NOT NULL AND length(btrim(n.email)) > 0
        AND c.email IS NOT NULL AND lower(c.email) = lower(n.email))         AS m_email,
      (n.nome_normalizado IS NOT NULL
        AND c.nome_normalizado = n.nome_normalizado)                          AS m_nome_exato,
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
      )
    LIMIT 50
  LOOP
    -- classifica força e razão
    IF cand.m_phone AND (cand.m_email OR cand.m_nome_exato) THEN
      v_match := 'forte';
    ELSIF cand.m_phone OR cand.m_email OR cand.m_nome_exato THEN
      v_match := 'provavel';
    ELSE
      v_match := 'possivel';
    END IF;

    v_reason := 'Detecção automática: ' || array_to_string(ARRAY[
      CASE WHEN cand.m_phone THEN 'telefone' END,
      CASE WHEN cand.m_email THEN 'email' END,
      CASE WHEN cand.m_nome_exato THEN 'nome' END,
      CASE WHEN NOT cand.m_nome_exato AND cand.sim_nome >= 0.6
           THEN 'nome ~' || round(cand.sim_nome::numeric, 2)::text END
    ]::text[], ', ');

    v_score := GREATEST(
      CASE WHEN cand.m_phone THEN 1.0 ELSE 0 END,
      CASE WHEN cand.m_email THEN 1.0 ELSE 0 END,
      CASE WHEN cand.m_nome_exato THEN 0.9 ELSE 0 END,
      cand.sim_nome
    )::real;

    pair_a := LEAST(n.id, cand.id);
    pair_b := GREATEST(n.id, cand.id);

    -- evita duplicar o par (em qualquer ordem, em qualquer status)
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
      -- corrida concorrente: outro trigger já criou o par
      NULL;
    END;
  END LOOP;

  RETURN inserted;
END $$;

REVOKE EXECUTE ON FUNCTION public.detect_contact_duplicates_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_contact_duplicates_for(uuid) TO service_role;

-- 2) Trigger AFTER INSERT — pega qualquer caminho de criação de contato
CREATE OR REPLACE FUNCTION public.trg_contacts_detect_dupes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.detect_contact_duplicates_for(NEW.id);
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_contacts_detect_dupes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contacts_dupes_after_insert ON public.contacts;
CREATE TRIGGER trg_contacts_dupes_after_insert
  AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contacts_detect_dupes();

-- 3) Varredura única nos contatos já existentes
DO $$
DECLARE
  r record;
  total integer := 0;
  scanned integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.contacts
    WHERE arquivado_at IS NULL
    ORDER BY created_at ASC
  LOOP
    total := total + public.detect_contact_duplicates_for(r.id);
    scanned := scanned + 1;
  END LOOP;
  RAISE NOTICE 'Varredura de duplicidades: % contatos varridos, % pares novos inseridos.', scanned, total;
END $$;