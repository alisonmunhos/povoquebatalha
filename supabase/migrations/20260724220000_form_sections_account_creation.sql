-- Seção especial "Criar conta" em formulários por etapas.

ALTER TABLE public.form_sections
  ADD COLUMN IF NOT EXISTS section_type text NOT NULL DEFAULT 'questions'
    CHECK (section_type IN ('questions', 'account_creation')),
  ADD COLUMN IF NOT EXISTS account_creation_role public.app_role DEFAULT 'agitador';

COMMENT ON COLUMN public.form_sections.section_type IS
  'questions = perguntas normais; account_creation = tela fixa de cadastro de usuário.';
COMMENT ON COLUMN public.form_sections.account_creation_role IS
  'Papel solicitado ao criar conta nesta seção (default agitador).';
