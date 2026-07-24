-- 20260723220000_form_sections_and_branching.sql
ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS layout_mode text NOT NULL DEFAULT 'flat'
    CHECK (layout_mode IN ('flat', 'sectioned'));

CREATE TABLE IF NOT EXISTS public.form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_definition_id uuid NOT NULL
    REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  title text,
  default_next_section_id uuid
    REFERENCES public.form_sections(id) ON DELETE SET NULL,
  confirmation_event_key text,
  confirmation_active boolean,
  whatsapp_button_enabled boolean,
  whatsapp_button_message text,
  success_screen_order text
    CHECK (success_screen_order IS NULL OR success_screen_order IN ('whatsapp_first', 'confirmation_first')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_definition_id, order_index)
);

ALTER TABLE public.form_definition_questions
  ADD COLUMN IF NOT EXISTS section_id uuid
    REFERENCES public.form_sections(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.form_question_branch_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL
    REFERENCES public.form_definition_questions(id) ON DELETE CASCADE,
  option_value text NOT NULL,
  next_section_id uuid
    REFERENCES public.form_sections(id) ON DELETE SET NULL,
  UNIQUE (question_id, option_value)
);

CREATE INDEX IF NOT EXISTS idx_form_sections_form
  ON public.form_sections(form_definition_id, order_index);
CREATE INDEX IF NOT EXISTS idx_fdq_section
  ON public.form_definition_questions(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_branch_rules_question
  ON public.form_question_branch_rules(question_id);

DROP TRIGGER IF EXISTS trg_form_sections_updated ON public.form_sections;
CREATE TRIGGER trg_form_sections_updated
  BEFORE UPDATE ON public.form_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_sections TO authenticated;
GRANT ALL ON public.form_sections TO service_role;
ALTER TABLE public.form_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_form_sections" ON public.form_sections;
CREATE POLICY "staff_view_form_sections" ON public.form_sections
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "admin_write_form_sections" ON public.form_sections;
CREATE POLICY "admin_write_form_sections" ON public.form_sections
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_question_branch_rules TO authenticated;
GRANT ALL ON public.form_question_branch_rules TO service_role;
ALTER TABLE public.form_question_branch_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_form_branch_rules" ON public.form_question_branch_rules;
CREATE POLICY "staff_view_form_branch_rules" ON public.form_question_branch_rules
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "admin_write_form_branch_rules" ON public.form_question_branch_rules;
CREATE POLICY "admin_write_form_branch_rules" ON public.form_question_branch_rules
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 20260723220100_choice_screens.sql
CREATE TABLE IF NOT EXISTS public.choice_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.choice_screen_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choice_screen_id uuid NOT NULL
    REFERENCES public.choice_screens(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  label text NOT NULL,
  description text,
  target_type text NOT NULL CHECK (target_type IN ('form', 'url')),
  target_form_slug text,
  target_url text,
  UNIQUE (choice_screen_id, order_index),
  CHECK (
    (target_type = 'form' AND target_form_slug IS NOT NULL AND target_url IS NULL)
    OR (target_type = 'url' AND target_url IS NOT NULL AND target_form_slug IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_choice_screen_options_screen
  ON public.choice_screen_options(choice_screen_id, order_index);

DROP TRIGGER IF EXISTS trg_choice_screens_updated ON public.choice_screens;
CREATE TRIGGER trg_choice_screens_updated
  BEFORE UPDATE ON public.choice_screens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.choice_screens TO authenticated;
GRANT ALL ON public.choice_screens TO service_role;
ALTER TABLE public.choice_screens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_choice_screens" ON public.choice_screens;
CREATE POLICY "staff_view_choice_screens" ON public.choice_screens
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "admin_write_choice_screens" ON public.choice_screens;
CREATE POLICY "admin_write_choice_screens" ON public.choice_screens
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.choice_screen_options TO authenticated;
GRANT ALL ON public.choice_screen_options TO service_role;
ALTER TABLE public.choice_screen_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_view_choice_screen_options" ON public.choice_screen_options;
CREATE POLICY "staff_view_choice_screen_options" ON public.choice_screen_options
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "admin_write_choice_screen_options" ON public.choice_screen_options;
CREATE POLICY "admin_write_choice_screen_options" ON public.choice_screen_options
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));