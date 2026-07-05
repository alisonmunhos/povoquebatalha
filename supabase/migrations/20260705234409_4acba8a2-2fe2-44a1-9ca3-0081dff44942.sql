-- Aplica as migrations do construtor de formulários (branch PR #1) que não haviam sido
-- executadas no banco. Todas as instruções são idempotentes.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS quem_indicou text,
  ADD COLUMN IF NOT EXISTS rede_social text,
  ADD COLUMN IF NOT EXISTS zona_eleitoral text,
  ADD COLUMN IF NOT EXISTS faixa_etaria text,
  ADD COLUMN IF NOT EXISTS disponibilidade jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.form_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  source_form_type public.source_form_type NOT NULL,
  event_key text NOT NULL UNIQUE,
  tracked_form_link_id uuid REFERENCES public.tracked_form_links(id) ON DELETE SET NULL,
  whatsapp_button_enabled boolean NOT NULL DEFAULT true,
  whatsapp_button_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_definitions TO authenticated;
GRANT ALL ON public.form_definitions TO service_role;
ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_form_definitions" ON public.form_definitions;
CREATE POLICY "staff_view_form_definitions" ON public.form_definitions
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "admin_write_form_definitions" ON public.form_definitions;
CREATE POLICY "admin_write_form_definitions" ON public.form_definitions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS trg_form_definitions_updated ON public.form_definitions;
CREATE TRIGGER trg_form_definitions_updated
  BEFORE UPDATE ON public.form_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.form_definition_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_definition_id uuid NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  source text NOT NULL CHECK (source IN ('catalog','custom')),
  catalog_field_key text,
  label text NOT NULL,
  help_text text,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fdq_form ON public.form_definition_questions(form_definition_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_definition_questions TO authenticated;
GRANT ALL ON public.form_definition_questions TO service_role;
ALTER TABLE public.form_definition_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_form_questions" ON public.form_definition_questions;
CREATE POLICY "staff_view_form_questions" ON public.form_definition_questions
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "admin_write_form_questions" ON public.form_definition_questions;
CREATE POLICY "admin_write_form_questions" ON public.form_definition_questions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.form_custom_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  form_definition_id uuid NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.form_definition_questions(id) ON DELETE CASCADE,
  question_label text NOT NULL,
  answer_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fca_contact ON public.form_custom_answers(contact_id);
CREATE INDEX IF NOT EXISTS idx_fca_form ON public.form_custom_answers(form_definition_id);
GRANT SELECT, INSERT ON public.form_custom_answers TO authenticated;
GRANT ALL ON public.form_custom_answers TO service_role;
ALTER TABLE public.form_custom_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_form_custom_answers" ON public.form_custom_answers;
CREATE POLICY "staff_view_form_custom_answers" ON public.form_custom_answers
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));