-- Telas de escolha configuráveis (Fluxo 1).

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
