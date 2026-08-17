ALTER TABLE public.whatsapp_templates
  DROP COLUMN IF EXISTS variable_labels;

ALTER TABLE public.whatsapp_templates
  DROP COLUMN IF EXISTS example_values;

ALTER TABLE public.whatsapp_templates
  ADD COLUMN example_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN parameter_format text NOT NULL DEFAULT 'named',
  ADD COLUMN source text NOT NULL DEFAULT 'app',
  ADD COLUMN header_example text;

ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_parameter_format_check
    CHECK (parameter_format IN ('named','positional')),
  ADD CONSTRAINT whatsapp_templates_source_check
    CHECK (source IN ('app','meta_import'));