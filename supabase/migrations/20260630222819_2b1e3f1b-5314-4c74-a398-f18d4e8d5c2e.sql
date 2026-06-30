
-- New fields for full contact ficha
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS nome_social text,
  ADD COLUMN IF NOT EXISTS profissao text,
  ADD COLUMN IF NOT EXISTS coletivo_alicerce boolean,
  ADD COLUMN IF NOT EXISTS tipo_contato text,
  ADD COLUMN IF NOT EXISTS formas_ajuda jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS consentimento_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_motivo text;

-- Auto-set consentimento_at when consent flips on
CREATE OR REPLACE FUNCTION public.contacts_consent_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.consentimento_whatsapp IS TRUE AND (TG_OP = 'INSERT' OR OLD.consentimento_whatsapp IS DISTINCT FROM TRUE) THEN
    IF NEW.consentimento_at IS NULL THEN NEW.consentimento_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contacts_consent ON public.contacts;
CREATE TRIGGER trg_contacts_consent BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_consent_timestamp();

-- Audit log for contact edits
CREATE TABLE IF NOT EXISTS public.contact_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_audit_contact ON public.contact_audit_log(contact_id, created_at DESC);

GRANT SELECT, INSERT ON public.contact_audit_log TO authenticated;
GRANT ALL ON public.contact_audit_log TO service_role;
ALTER TABLE public.contact_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read audit" ON public.contact_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert audit" ON public.contact_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
