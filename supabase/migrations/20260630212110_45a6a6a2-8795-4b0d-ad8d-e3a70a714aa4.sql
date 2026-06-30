
-- ============================================================
-- Encoding/dedup/phone normalization upgrade for contacts
-- ============================================================

-- 1) Enums for phone & lifecycle status
DO $$ BEGIN
  CREATE TYPE public.contact_phone_status AS ENUM (
    'valido','precisa_revisao','invalido','sem_ddd','sem_nono_digito','duplicado_possivel'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_lifecycle_status AS ENUM (
    'importado_aguardando_recadastro','link_enviado','recadastro_iniciado',
    'recadastro_concluido','nao_respondeu','telefone_invalido','precisa_revisao',
    'duplicado_possivel','duplicado_mesclado','nao_enviar'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) New columns on contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS nome_normalizado text,
  ADD COLUMN IF NOT EXISTS phone_digits text,
  ADD COLUMN IF NOT EXISTS phone_ddi text,
  ADD COLUMN IF NOT EXISTS phone_ddd text,
  ADD COLUMN IF NOT EXISTS phone_last9 text,
  ADD COLUMN IF NOT EXISTS phone_whatsapp_candidate text,
  ADD COLUMN IF NOT EXISTS phone_status public.contact_phone_status,
  ADD COLUMN IF NOT EXISTS lifecycle_status public.contact_lifecycle_status,
  ADD COLUMN IF NOT EXISTS origem_detalhe text,
  ADD COLUMN IF NOT EXISTS recad_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS tipo text;  -- 'apoiador' | 'lista_divulgacao' | etc

-- 3) Parse phone function (returns jsonb with all fields)
CREATE OR REPLACE FUNCTION private.parse_phone_br(input text, default_ddd text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, private
AS $$
DECLARE
  digits text;
  ddi text := '55';
  ddd text;
  subscriber text;
  e164 text;
  candidate text;
  status public.contact_phone_status := 'invalido';
  last8 text;
  last9 text;
BEGIN
  IF input IS NULL OR length(trim(input)) = 0 THEN
    RETURN jsonb_build_object('status','invalido');
  END IF;

  digits := regexp_replace(input, '[^0-9]', '', 'g');
  digits := regexp_replace(digits, '^0+', '');

  -- With DDI 55
  IF length(digits) IN (12,13) AND left(digits,2) = '55' THEN
    ddd := substring(digits from 3 for 2);
    subscriber := substring(digits from 5);
  -- Without DDI, with DDD
  ELSIF length(digits) IN (10,11) THEN
    ddd := substring(digits from 1 for 2);
    subscriber := substring(digits from 3);
  -- Without DDD, try default
  ELSIF length(digits) IN (8,9) AND default_ddd IS NOT NULL AND length(regexp_replace(default_ddd,'\D','','g')) = 2 THEN
    ddd := regexp_replace(default_ddd,'\D','','g');
    subscriber := digits;
    status := 'precisa_revisao';
  ELSIF length(digits) IN (8,9) THEN
    RETURN jsonb_build_object(
      'phone_digits', digits, 'status','sem_ddd',
      'phone_last8', right(digits,8),
      'phone_last9', CASE WHEN length(digits)>=9 THEN right(digits,9) ELSE NULL END
    );
  ELSE
    RETURN jsonb_build_object('phone_digits', digits, 'status','invalido');
  END IF;

  -- Subscriber must be 8 or 9 digits
  IF length(subscriber) NOT IN (8,9) THEN
    RETURN jsonb_build_object('phone_digits', digits, 'status','invalido');
  END IF;

  e164 := '+' || ddi || ddd || subscriber;

  -- 8-digit subscriber: probable celular antigo missing 9
  IF length(subscriber) = 8 AND left(subscriber,1) IN ('6','7','8','9') THEN
    candidate := '+' || ddi || ddd || '9' || subscriber;
    IF status = 'invalido' THEN status := 'sem_nono_digito'; END IF;
  ELSIF length(subscriber) = 9 AND left(subscriber,1) = '9' THEN
    candidate := e164;
    IF status = 'invalido' THEN status := 'valido'; END IF;
  ELSE
    -- 8 dígitos com início 2-5 = fixo, ou 9 dígitos sem '9' -> valido como fixo, sem candidate WA
    candidate := e164;
    IF status = 'invalido' THEN status := 'valido'; END IF;
  END IF;

  last8 := right(regexp_replace(e164,'\D','','g'),8);
  last9 := CASE WHEN length(regexp_replace(e164,'\D','','g')) >= 9
                THEN right(regexp_replace(e164,'\D','','g'),9) ELSE NULL END;

  RETURN jsonb_build_object(
    'phone_digits', digits,
    'phone_ddi', ddi,
    'phone_ddd', ddd,
    'phone_e164', e164,
    'phone_last8', last8,
    'phone_last9', last9,
    'phone_whatsapp_candidate', candidate,
    'status', status
  );
END; $$;

GRANT EXECUTE ON FUNCTION private.parse_phone_br(text, text) TO authenticated, service_role;

-- 4) Trigger to populate all phone fields + nome_normalizado
CREATE OR REPLACE FUNCTION public.contacts_phone_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
DECLARE p jsonb;
BEGIN
  IF NEW.nome IS NOT NULL THEN
    NEW.nome_normalizado := lower(public.unaccent(trim(NEW.nome)));
  END IF;

  IF NEW.phone_raw IS NOT NULL THEN
    p := private.parse_phone_br(NEW.phone_raw, NULL);
    NEW.phone_digits := p->>'phone_digits';
    NEW.phone_ddi := p->>'phone_ddi';
    NEW.phone_ddd := p->>'phone_ddd';
    NEW.phone_e164 := p->>'phone_e164';
    NEW.phone_last8 := p->>'phone_last8';
    NEW.phone_last9 := p->>'phone_last9';
    NEW.phone_whatsapp_candidate := p->>'phone_whatsapp_candidate';
    IF NEW.phone_status IS NULL THEN
      NEW.phone_status := (p->>'status')::public.contact_phone_status;
    END IF;
  END IF;

  IF NEW.lifecycle_status IS NULL THEN
    NEW.lifecycle_status := CASE NEW.origem
      WHEN 'import' THEN 'importado_aguardando_recadastro'::public.contact_lifecycle_status
      ELSE 'recadastro_concluido'::public.contact_lifecycle_status
    END;
  END IF;

  RETURN NEW;
END; $$;

-- Re-create trigger (was BEFORE INSERT only originally)
DROP TRIGGER IF EXISTS trg_contacts_phone_fill ON public.contacts;
CREATE TRIGGER trg_contacts_phone_fill
  BEFORE INSERT OR UPDATE OF nome, phone_raw, origem ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_phone_fill();

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_phone_last8 ON public.contacts(phone_last8);
CREATE INDEX IF NOT EXISTS idx_contacts_nome_norm_trgm ON public.contacts USING gin (nome_normalizado public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower ON public.contacts (lower(email));

-- 6) Backfill existing rows
UPDATE public.contacts SET nome = nome WHERE nome_normalizado IS NULL;

-- 7) contact_duplicates table
CREATE TABLE IF NOT EXISTS public.contact_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_a uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  contact_b uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('forte','provavel','possivel')),
  score real,
  reason text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','mesclado','separados','ignorado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  UNIQUE (contact_a, contact_b)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_duplicates TO authenticated;
GRANT ALL ON public.contact_duplicates TO service_role;
ALTER TABLE public.contact_duplicates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth can read duplicates" ON public.contact_duplicates;
CREATE POLICY "auth can read duplicates" ON public.contact_duplicates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth can manage duplicates" ON public.contact_duplicates;
CREATE POLICY "auth can manage duplicates" ON public.contact_duplicates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_contact_dup_status ON public.contact_duplicates(status);

-- 8) Add preview jsonb on import_rows for staged commit
ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS preview jsonb;
