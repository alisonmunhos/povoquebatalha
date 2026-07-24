-- Perguntas customizadas: texto livre ou escolha única com opções próprias.

ALTER TABLE public.form_definition_questions
  ADD COLUMN IF NOT EXISTS custom_response_type text
    CHECK (custom_response_type IS NULL OR custom_response_type IN ('short_text', 'single_choice')),
  ADD COLUMN IF NOT EXISTS custom_options jsonb;

ALTER TABLE public.form_definition_questions
  DROP CONSTRAINT IF EXISTS form_definition_questions_custom_type_source_check;

ALTER TABLE public.form_definition_questions
  ADD CONSTRAINT form_definition_questions_custom_type_source_check
  CHECK (
    (source = 'catalog' AND custom_response_type IS NULL AND custom_options IS NULL)
    OR (source = 'custom')
  );

ALTER TABLE public.form_definition_questions
  DROP CONSTRAINT IF EXISTS form_definition_questions_custom_options_check;

ALTER TABLE public.form_definition_questions
  ADD CONSTRAINT form_definition_questions_custom_options_check
  CHECK (
    custom_response_type IS DISTINCT FROM 'single_choice'
    OR (
      custom_options IS NOT NULL
      AND jsonb_typeof(custom_options) = 'array'
      AND jsonb_array_length(custom_options) >= 2
    )
  );
