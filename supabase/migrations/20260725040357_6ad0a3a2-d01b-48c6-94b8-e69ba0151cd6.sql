-- 20260724200000_form_sections_description.sql
ALTER TABLE public.form_sections
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.form_sections.description IS
  'Texto opcional exibido entre o título da seção e as perguntas no formulário público.';

-- 20260724210000_legal_pages.sql
CREATE TABLE IF NOT EXISTS public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_pages_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

DROP TRIGGER IF EXISTS trg_legal_pages_updated ON public.legal_pages;
CREATE TRIGGER trg_legal_pages_updated
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_pages TO authenticated;
GRANT ALL ON public.legal_pages TO service_role;

ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_view_legal_pages" ON public.legal_pages;
CREATE POLICY "staff_view_legal_pages" ON public.legal_pages
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "admin_write_legal_pages" ON public.legal_pages;
CREATE POLICY "admin_write_legal_pages" ON public.legal_pages
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 20260724220000_form_sections_account_creation.sql
ALTER TABLE public.form_sections
  ADD COLUMN IF NOT EXISTS section_type text NOT NULL DEFAULT 'questions'
    CHECK (section_type IN ('questions', 'account_creation')),
  ADD COLUMN IF NOT EXISTS account_creation_role public.app_role DEFAULT 'agitador';

COMMENT ON COLUMN public.form_sections.section_type IS
  'questions = perguntas normais; account_creation = tela fixa de cadastro de usuário.';
COMMENT ON COLUMN public.form_sections.account_creation_role IS
  'Papel solicitado ao criar conta nesta seção (default agitador).';