
-- 1. Adicionar colunas faltantes em form_definitions
ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;

ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS success_screen_order text NOT NULL DEFAULT 'whatsapp_first';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_definitions_success_screen_order_check'
  ) THEN
    ALTER TABLE public.form_definitions
      ADD CONSTRAINT form_definitions_success_screen_order_check
      CHECK (success_screen_order IN ('whatsapp_first','confirmation_first'));
  END IF;
END $$;

-- 2. Seed dos 2 formulários fixos (idempotente)
INSERT INTO public.form_definitions (slug, title, source_form_type, event_key, is_fixed, is_active, whatsapp_button_enabled)
VALUES
  ('recadastro-fixo', 'Recadastro completo', 'cadastro_completo', 'formulario:recadastro-fixo', true, true, true),
  ('inscrever-fixo',  'Inscrição simples',   'receber_informacoes','formulario:inscrever-fixo',  true, true, true)
ON CONFLICT (slug) DO UPDATE SET is_fixed = true, is_active = true;

-- 3. Seed das 3 perguntas core em cada formulário fixo (idempotente por catalog_field_key)
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN SELECT id FROM public.form_definitions WHERE slug IN ('recadastro-fixo','inscrever-fixo') LOOP
    INSERT INTO public.form_definition_questions (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
    SELECT f.id, 0, 'catalog', 'nome', 'Nome completo', NULL, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.form_definition_questions
      WHERE form_definition_id = f.id AND catalog_field_key = 'nome'
    );

    INSERT INTO public.form_definition_questions (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
    SELECT f.id, 1, 'catalog', 'whatsapp', 'WhatsApp', 'Com DDD, ex.: (11) 91234-5678', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.form_definition_questions
      WHERE form_definition_id = f.id AND catalog_field_key = 'whatsapp'
    );

    INSERT INTO public.form_definition_questions (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
    SELECT f.id, 2, 'catalog', 'consentimento', 'Aceito receber mensagens da campanha pelo WhatsApp', NULL, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.form_definition_questions
      WHERE form_definition_id = f.id AND catalog_field_key = 'consentimento'
    );
  END LOOP;
END $$;
