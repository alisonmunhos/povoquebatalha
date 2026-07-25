-- Instrução/descrição opcional por seção (exibida no formulário público entre título e perguntas).
ALTER TABLE public.form_sections
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.form_sections.description IS
  'Texto opcional exibido entre o título da seção e as perguntas no formulário público.';
