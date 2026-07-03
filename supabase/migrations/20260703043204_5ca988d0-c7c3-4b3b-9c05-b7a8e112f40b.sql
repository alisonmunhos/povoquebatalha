-- Precisão de geocodificação
DO $$ BEGIN
  CREATE TYPE public.geocoding_precision AS ENUM ('exato','rua','cep','cidade');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS geocoding_precision public.geocoding_precision,
  ADD COLUMN IF NOT EXISTS geocoding_match_score numeric;

ALTER TABLE public.geocode_cache
  ADD COLUMN IF NOT EXISTS geocoding_precision public.geocoding_precision,
  ADD COLUMN IF NOT EXISTS geocoding_match_score numeric;

-- Marcar como pendentes os que precisam do novo pipeline preciso:
-- endereço completo mas sem precisão registrada (ou aproximada)
UPDATE public.contacts
   SET geocoding_status = 'pendente'::public.geocoding_status
 WHERE arquivado_at IS NULL
   AND endereco_completo IS NOT NULL
   AND (geocoding_precision IS NULL OR geocoding_precision IN ('cep','cidade'));
