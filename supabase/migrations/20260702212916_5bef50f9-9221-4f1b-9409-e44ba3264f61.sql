
-- 1. Novo campo texto para "Outro" das formas de ajuda
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS formas_ajuda_outro text;

-- 2. Backfill: formato antigo {opcoes:[...], outro:"..."} -> array + texto separado
DO $$
DECLARE
  r record;
  v_opcoes jsonb;
  v_outro text;
  v_new jsonb;
BEGIN
  FOR r IN
    SELECT id, formas_ajuda
    FROM public.contacts
    WHERE formas_ajuda IS NOT NULL
      AND jsonb_typeof(formas_ajuda) = 'object'
  LOOP
    v_opcoes := COALESCE(r.formas_ajuda -> 'opcoes', '[]'::jsonb);
    IF jsonb_typeof(v_opcoes) <> 'array' THEN
      v_opcoes := '[]'::jsonb;
    END IF;
    v_outro := NULLIF(r.formas_ajuda ->> 'outro', '');

    UPDATE public.contacts
       SET formas_ajuda = v_opcoes,
           formas_ajuda_outro = COALESCE(formas_ajuda_outro, v_outro)
     WHERE id = r.id;

    INSERT INTO public.contact_audit_log (contact_id, action, changes)
    VALUES (r.id, 'backfill_atualizacao_apoiadores',
            jsonb_build_object(
              'motivo', 'Migração de formas_ajuda de objeto para lista',
              'antes', r.formas_ajuda,
              'depois', jsonb_build_object('formas_ajuda', v_opcoes, 'formas_ajuda_outro', v_outro)
            ));
  END LOOP;
END $$;

-- 3. Normaliza valores legados dentro do array (panfletagem / Panfletagem (legado) -> panfletagem_banquinha)
DO $$
DECLARE
  r record;
  v_new jsonb;
  v_changed boolean;
BEGIN
  FOR r IN
    SELECT id, formas_ajuda
    FROM public.contacts
    WHERE formas_ajuda IS NOT NULL
      AND jsonb_typeof(formas_ajuda) = 'array'
      AND (
        formas_ajuda @> '["panfletagem"]'::jsonb
        OR formas_ajuda @> '["Panfletagem (legado)"]'::jsonb
        OR formas_ajuda @> '["Panfletagem"]'::jsonb
      )
  LOOP
    SELECT COALESCE(jsonb_agg(DISTINCT val), '[]'::jsonb)
      INTO v_new
      FROM (
        SELECT CASE
                 WHEN elem IN ('panfletagem','Panfletagem','Panfletagem (legado)')
                   THEN 'panfletagem_banquinha'
                 ELSE elem
               END AS val
          FROM jsonb_array_elements_text(r.formas_ajuda) AS t(elem)
      ) s;

    IF v_new IS DISTINCT FROM r.formas_ajuda THEN
      UPDATE public.contacts SET formas_ajuda = v_new WHERE id = r.id;
      INSERT INTO public.contact_audit_log (contact_id, action, changes)
      VALUES (r.id, 'backfill_atualizacao_apoiadores',
              jsonb_build_object(
                'motivo', 'Consolidação de valor legado "panfletagem" para "panfletagem_banquinha"',
                'antes', r.formas_ajuda,
                'depois', v_new
              ));
    END IF;
  END LOOP;
END $$;
