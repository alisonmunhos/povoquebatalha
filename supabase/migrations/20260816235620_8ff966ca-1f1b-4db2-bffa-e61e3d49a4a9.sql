CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text NOT NULL DEFAULT 'UTILITY',
  body_text text NOT NULL DEFAULT '',
  variable_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  example_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  header_type text NOT NULL DEFAULT 'NONE',
  header_text text,
  footer_text text,
  meta_template_id text,
  status text NOT NULL DEFAULT 'draft',
  rejected_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_category_chk CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  CONSTRAINT whatsapp_templates_header_chk CHECK (header_type IN ('NONE','TEXT')),
  CONSTRAINT whatsapp_templates_status_chk CHECK (status IN ('draft','pending','approved','rejected','paused','disabled')),
  CONSTRAINT whatsapp_templates_name_lang_uq UNIQUE (name, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff autenticado pode ler templates"
ON public.whatsapp_templates FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "Admin cria templates"
ON public.whatsapp_templates FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin edita templates"
ON public.whatsapp_templates FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin apaga rascunhos"
ON public.whatsapp_templates FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin') AND status = 'draft');

CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();