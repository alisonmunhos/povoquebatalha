
-- Endereço completo + geolocalização + whatsapp_status + arquivamento
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS endereco_completo text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geocoding_provider text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS arquivado_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_id uuid;

-- enum geocoding_status
DO $$ BEGIN
  CREATE TYPE public.geocoding_status AS ENUM ('pendente','localizado','aproximado','erro','precisa_revisao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS geocoding_status public.geocoding_status DEFAULT 'pendente';

-- enum whatsapp_status
DO $$ BEGIN
  CREATE TYPE public.whatsapp_status AS ENUM ('desconhecido','confirmado','invalido','erro_envio','opt_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_status public.whatsapp_status DEFAULT 'desconhecido';

-- FK opcional para rastrear importação de origem
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_import_id_fkey;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_import_id_fkey
  FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_import_id ON public.contacts(import_id);
CREATE INDEX IF NOT EXISTS idx_contacts_arquivado ON public.contacts(arquivado_at) WHERE arquivado_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_geocoding ON public.contacts(geocoding_status);

-- Novos status de importação
DO $$ BEGIN
  ALTER TYPE public.import_status ADD VALUE IF NOT EXISTS 'previewed';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.import_status ADD VALUE IF NOT EXISTS 'confirmed';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.import_status ADD VALUE IF NOT EXISTS 'canceled';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.import_status ADD VALUE IF NOT EXISTS 'reverted';
EXCEPTION WHEN others THEN NULL; END $$;

-- Tabela de auditoria de importações
CREATE TABLE IF NOT EXISTS public.import_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.imports(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_count int NOT NULL DEFAULT 0,
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_audit_log TO authenticated;
GRANT ALL ON public.import_audit_log TO service_role;

ALTER TABLE public.import_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit log: staff read"
  ON public.import_audit_log FOR SELECT
  USING (private.is_staff(auth.uid()));

CREATE POLICY "audit log: staff insert"
  ON public.import_audit_log FOR INSERT
  WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_import_audit_log_import ON public.import_audit_log(import_id, created_at DESC);

-- Tabela de mesclagens (preparação Etapa C)
CREATE TABLE IF NOT EXISTS public.contact_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  merged_id uuid,
  merged_snapshot jsonb NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.contact_merges TO authenticated;
GRANT ALL ON public.contact_merges TO service_role;

ALTER TABLE public.contact_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merges: staff read"
  ON public.contact_merges FOR SELECT
  USING (private.is_staff(auth.uid()));

CREATE POLICY "merges: staff insert"
  ON public.contact_merges FOR INSERT
  WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_contact_merges_survivor ON public.contact_merges(survivor_id);

-- Função helper: monta endereco_completo a partir das partes
CREATE OR REPLACE FUNCTION public.build_endereco_completo(
  p_endereco text, p_numero text, p_complemento text,
  p_bairro text, p_cidade text, p_uf text, p_cep text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT NULLIF(trim(both ', ' FROM
    concat_ws(', ',
      NULLIF(trim(concat_ws(' ', NULLIF(p_endereco,''), NULLIF(p_numero,''))), ''),
      NULLIF(p_complemento,''),
      NULLIF(p_bairro,''),
      NULLIF(trim(concat_ws('/', NULLIF(p_cidade,''), NULLIF(p_uf,''))), ''),
      NULLIF(p_cep,'')
    )), '');
$$;

-- Trigger: mantém endereco_completo e reseta geocoding ao mudar endereço
CREATE OR REPLACE FUNCTION public.contacts_address_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE old_addr text; new_addr text;
BEGIN
  new_addr := public.build_endereco_completo(NEW.endereco, NEW.numero, NEW.complemento, NEW.bairro, NEW.cidade, NEW.uf, NEW.cep);
  NEW.endereco_completo := new_addr;

  IF TG_OP = 'UPDATE' THEN
    old_addr := public.build_endereco_completo(OLD.endereco, OLD.numero, OLD.complemento, OLD.bairro, OLD.cidade, OLD.uf, OLD.cep);
    IF old_addr IS DISTINCT FROM new_addr THEN
      -- Endereço mudou: marcar para re-geocodificar
      NEW.geocoding_status := 'pendente';
      NEW.latitude := NULL;
      NEW.longitude := NULL;
      NEW.geocoded_at := NULL;
      NEW.geocoding_provider := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contacts_address_fill ON public.contacts;
CREATE TRIGGER trg_contacts_address_fill
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_address_fill();

-- Backfill: popular endereco_completo nos contatos existentes
UPDATE public.contacts SET updated_at = updated_at WHERE endereco_completo IS NULL;
