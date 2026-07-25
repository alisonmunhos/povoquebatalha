-- Semeia nome, WhatsApp e consentimento na primeira seção (order_index 0) de formulários
-- por seções que ainda não têm esses campos core.

INSERT INTO public.form_definition_questions (
  form_definition_id,
  section_id,
  order_index,
  source,
  catalog_field_key,
  label,
  help_text,
  required
)
SELECT
  fd.id,
  fs.id,
  core.ord,
  'catalog',
  core.catalog_key,
  core.label,
  core.help_text,
  true
FROM public.form_definitions fd
JOIN public.form_sections fs
  ON fs.form_definition_id = fd.id
 AND fs.order_index = 0
CROSS JOIN (
  VALUES
    (0, 'nome', 'Nome completo', NULL::text),
    (1, 'whatsapp', 'WhatsApp', 'Com DDD, ex.: (11) 91234-5678'),
    (2, 'consentimento', 'Aceito receber mensagens da campanha pelo WhatsApp', NULL::text)
) AS core(ord, catalog_key, label, help_text)
WHERE fd.layout_mode = 'sectioned'
  AND NOT EXISTS (
    SELECT 1
    FROM public.form_definition_questions q
    WHERE q.form_definition_id = fd.id
      AND q.catalog_field_key = core.catalog_key
  );
