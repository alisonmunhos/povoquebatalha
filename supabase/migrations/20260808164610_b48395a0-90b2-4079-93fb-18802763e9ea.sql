WITH notes AS (
  SELECT l.contact_id,
         string_agg('[' || to_char(l.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || '] ' || btrim(l.note), E'\n' ORDER BY l.created_at) AS block
  FROM public.territory_contact_logs l
  WHERE l.action = 'observacao'
    AND l.note IS NOT NULL AND btrim(l.note) <> ''
    AND l.hidden_at IS NULL
    AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY l.contact_id
)
UPDATE public.contacts c
SET observacoes = btrim(CASE
      WHEN COALESCE(btrim(c.observacoes), '') = '' THEN n.block
      ELSE c.observacoes || E'\n' || n.block
    END)
FROM notes n
WHERE c.id = n.contact_id
  AND position(n.block in COALESCE(c.observacoes, '')) = 0;